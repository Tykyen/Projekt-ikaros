import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { startTestDb, TestDb } from '../../../test/helpers/db';
import {
  UserOnboardingSchema,
  UserOnboardingSchemaClass,
} from './schemas/user-onboarding.schema';
import { UserSchema, UserSchemaClass } from '../users/schemas/user.schema';
import {
  VypravecTelemetrySchema,
  VypravecTelemetrySchemaClass,
} from './schemas/vypravec-telemetry.schema';
import { UserOnboardingService } from './user-onboarding.service';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

/**
 * Spec 26.3 — povinné testy 04 §10: merge A→B→A přes 2 zařízení (set-union
 * dismissed, $min steps, first-write contextWorldId), idempotence re-POST,
 * legacy flag, escapování teček v ID, self-delete cleanup.
 */
describe('UserOnboardingService (mms)', () => {
  let db: TestDb;
  let service: UserOnboardingService;
  let users: Model<UserSchemaClass>;
  let moduleRef: TestingModule;

  const UID = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    db = await startTestDb();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.uri),
        MongooseModule.forFeature([
          {
            name: UserOnboardingSchemaClass.name,
            schema: UserOnboardingSchema,
          },
          { name: UserSchemaClass.name, schema: UserSchema },
          {
            name: VypravecTelemetrySchemaClass.name,
            schema: VypravecTelemetrySchema,
          },
        ]),
      ],
      providers: [UserOnboardingService],
    }).compile();
    service = moduleRef.get(UserOnboardingService);
    users = moduleRef.get(getModelToken(UserSchemaClass.name));
  }, 90000);

  afterAll(async () => {
    await moduleRef?.close();
    await db.stop();
  });

  it('PATCH upsert + GET vrací stav s dekódovanými klíči (tečky v ID)', async () => {
    const out = await service.patch(UID, {
      persona: 'pj',
      seenRoutesAdd: ['/svet/:worldSlug/chat'],
      journeys: {
        'pj-start': {
          startedAt: '2026-07-21T10:00:00Z',
          steps: { 'pj.create-world': '2026-07-21T10:05:00Z' },
        },
      },
      milestones: { 'prvni.svet': '2026-07-21T10:05:00Z' },
    });
    expect(out.persona).toBe('pj');
    expect(out.journeys['pj-start'].steps['pj.create-world']).toBe(
      '2026-07-21T10:05:00.000Z',
    );
    expect(out.milestones['prvni.svet']).toBe('2026-07-21T10:05:00.000Z');

    const { state, legacy } = await service.get(UID);
    expect(legacy).toBe(false);
    expect(state?.journeys['pj-start'].steps['pj.create-world']).toBeDefined();
  });

  it('merge A→B→A přes 2 zařízení: dismissed = set-union (zavřené se NEVRACÍ)', async () => {
    // zařízení A zavře tip1, B (stale) pošle jen tip2 — union drží oba
    await service.patch(UID, { dismissedAdd: ['tip1'] });
    const afterB = await service.patch(UID, { dismissedAdd: ['tip2'] });
    expect(afterB.dismissed.sort()).toEqual(['tip1', 'tip2']);
    // A pošle znovu tip1 (re-POST) — beze změny, žádná duplicita
    const afterA2 = await service.patch(UID, { dismissedAdd: ['tip1'] });
    expect(afterA2.dismissed.sort()).toEqual(['tip1', 'tip2']);
  });

  it('steps: $min — dřívější doneAt vyhrává (idempotentní re-POST)', async () => {
    await service.patch(UID, {
      journeys: {
        'pj-start': { steps: { 'pj.invite': '2026-07-21T12:00:00Z' } },
      },
    });
    const out = await service.patch(UID, {
      journeys: {
        'pj-start': { steps: { 'pj.invite': '2026-07-21T11:00:00Z' } },
      },
    });
    expect(out.journeys['pj-start'].steps['pj.invite']).toBe(
      '2026-07-21T11:00:00.000Z',
    );
    const out2 = await service.patch(UID, {
      journeys: {
        'pj-start': { steps: { 'pj.invite': '2026-07-21T13:00:00Z' } },
      },
    });
    expect(out2.journeys['pj-start'].steps['pj.invite']).toBe(
      '2026-07-21T11:00:00.000Z',
    );
  });

  it('contextWorldId: first-write-wins — druhý zápis fixaci NEZMĚNÍ', async () => {
    await service.patch(UID, {
      journeys: { 'pj-start': { contextWorldId: 'svet-A' } },
    });
    const out = await service.patch(UID, {
      journeys: { 'pj-start': { contextWorldId: 'svet-B' } },
    });
    expect(out.journeys['pj-start'].contextWorldId).toBe('svet-A');
  });

  it('pausedAt: LWW vč. null (zrušení pauzy)', async () => {
    await service.patch(UID, {
      journeys: { 'pj-start': { pausedAt: '2026-07-21T14:00:00Z' } },
    });
    const out = await service.patch(UID, {
      journeys: { 'pj-start': { pausedAt: null } },
    });
    expect(out.journeys['pj-start'].pausedAt).toBeNull();
  });

  it('GET legacy: účet starší než release → true; mladší → false', async () => {
    const oldId = new mongoose.Types.ObjectId();
    const youngId = new mongoose.Types.ObjectId();
    // createdAt řídí timestamps → vložit přímo přes kolekci
    await users.collection.insertMany([
      {
        _id: oldId,
        email: 'stary@t.cz',
        username: 'stary',
        password: 'x',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        _id: youngId,
        email: 'novy@t.cz',
        username: 'novy',
        password: 'x',
        createdAt: new Date('2027-01-01'),
        updatedAt: new Date('2027-01-01'),
      },
    ]);
    expect((await service.get(oldId.toString())).legacy).toBe(true);
    expect((await service.get(youngId.toString())).legacy).toBe(false);
  });

  it('odmítne klíč s `$` i s `:` (injection / kolize escapování)', async () => {
    await expect(
      service.patch(UID, { milestones: { $where: '2026-07-21T10:00:00Z' } }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.patch(UID, { milestones: { 'a:b': '2026-07-21T10:00:00Z' } }),
    ).rejects.toThrow(BadRequestException);
  });

  it('user.deletion.requested → stav i telemetrie pryč (GDPR)', async () => {
    const telemetry = moduleRef.get<Model<VypravecTelemetrySchemaClass>>(
      getModelToken(VypravecTelemetrySchemaClass.name),
    );
    await telemetry.create({ userId: UID, event: 'step_done' });
    await service.onUserDeleted({ userId: UID });
    const { state } = await service.get(UID);
    expect(state).toBeNull();
    expect(await telemetry.countDocuments({ userId: UID })).toBe(0);
  });
});
