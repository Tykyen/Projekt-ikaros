import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import {
  UserOnboardingDocument,
  UserOnboardingSchemaClass,
} from './schemas/user-onboarding.schema';
import {
  VypravecTelemetryDocument,
  VypravecTelemetrySchemaClass,
} from './schemas/vypravec-telemetry.schema';
import { UserSchemaClass } from '../users/schemas/user.schema';
import { PatchOnboardingDto, SAFE_KEY_RE } from './dto/patch-onboarding.dto';

/**
 * Spec 26.3 — od kdy běží Vypravěč v produkci. Účet založený DŘÍV je „legacy"
 * (backfill na FE: seed seenRoutes z registru, žádný auto-open persona dialogu,
 * milníky bez oslav — 04 §5.4). Env přebíjí konstantu (nasazení ≠ merge den).
 */
const VYPRAVEC_RELEASE_FALLBACK = '2026-07-25T00:00:00Z';

export interface OnboardingEntity {
  persona: 'pj' | 'hrac' | 'worldbuilder' | null;
  journeys: Record<
    string,
    {
      startedAt: string;
      contextWorldId?: string;
      steps: Record<string, string>;
      pausedAt?: string | null;
      dismissedAt?: string | null;
    }
  >;
  seenRoutes: string[];
  dismissed: string[];
  milestones: Record<string, string>;
  mode: 'active' | 'onCall';
  lastSeenChangelog?: string;
  backfilled: boolean;
  updatedAt: string;
}

/** Mongo dot-path neunese tečky v klíčích map → escapování na hranici service. */
const encKey = (k: string): string => k.replace(/\./g, ':');
const decKey = (k: string): string => k.replace(/:/g, '.');

function assertSafeKeys(keys: string[]): void {
  for (const k of keys) {
    if (!SAFE_KEY_RE.test(k) || k.includes(':')) {
      throw new BadRequestException(`Neplatný klíč: ${k.slice(0, 40)}`);
    }
  }
}

function isIso(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

@Injectable()
export class UserOnboardingService {
  private readonly logger = new Logger(UserOnboardingService.name);

  constructor(
    @InjectModel(UserOnboardingSchemaClass.name)
    private readonly model: Model<UserOnboardingDocument>,
    @InjectModel(UserSchemaClass.name)
    private readonly users: Model<UserSchemaClass>,
    @InjectModel(VypravecTelemetrySchemaClass.name)
    private readonly telemetry: Model<VypravecTelemetryDocument>,
  ) {}

  private releaseDate(): Date {
    const env = process.env.VYPRAVEC_RELEASE_DATE;
    return new Date(
      env && !Number.isNaN(Date.parse(env)) ? env : VYPRAVEC_RELEASE_FALLBACK,
    );
  }

  /** GET /users/me/onboarding — state + legacy flag (backfill seed dělá FE). */
  async get(
    userId: string,
  ): Promise<{ state: OnboardingEntity | null; legacy: boolean }> {
    const doc = await this.model.findOne({ userId }).lean();
    if (doc) return { state: this.toEntity(doc), legacy: false };

    const user = await this.users
      .findById(userId)
      .select('createdAt')
      .lean<{ createdAt?: Date }>();
    const legacy =
      !!user?.createdAt &&
      user.createdAt.getTime() < this.releaseDate().getTime();
    return { state: null, legacy };
  }

  /**
   * PATCH — delta merge výhradně Mongo operátory (souběh zařízení bezpečný,
   * re-POST idempotentní): set-union pole · $min časy · LWW skaláry ·
   * contextWorldId first-write-wins (druhý update s pipeline $ifNull —
   * nejde míchat s $addToSet v jednom příkazu).
   */
  async patch(
    userId: string,
    dto: PatchOnboardingDto,
  ): Promise<OnboardingEntity> {
    const set: Record<string, unknown> = {};
    const min: Record<string, Date> = {};
    const addToSet: Record<string, { $each: string[] }> = {};
    const firstWrite: Array<{ path: string; value: string }> = [];

    if (dto.persona !== undefined) set.persona = dto.persona;
    if (dto.mode !== undefined) set.mode = dto.mode;
    if (dto.lastSeenChangelog !== undefined)
      set.lastSeenChangelog = dto.lastSeenChangelog;
    if (dto.backfilled !== undefined) set.backfilled = dto.backfilled;

    if (dto.seenRoutesAdd?.length)
      addToSet.seenRoutes = { $each: dto.seenRoutesAdd };
    if (dto.dismissedAdd?.length)
      addToSet.dismissed = { $each: dto.dismissedAdd };

    if (dto.milestones) {
      const keys = Object.keys(dto.milestones);
      assertSafeKeys(keys);
      if (keys.length > 50)
        throw new BadRequestException('Příliš mnoho milníků');
      for (const k of keys) {
        const v = dto.milestones[k];
        if (!isIso(v))
          throw new BadRequestException(`Milník ${k}: neplatné datum`);
        min[`milestones.${encKey(k)}`] = new Date(v);
      }
    }

    if (dto.journeys) {
      const jKeys = Object.keys(dto.journeys);
      assertSafeKeys(jKeys);
      if (jKeys.length > 20) throw new BadRequestException('Příliš mnoho cest');
      for (const jId of jKeys) {
        const j = dto.journeys[jId];
        const base = `journeys.${encKey(jId)}`;
        if (j.startedAt !== undefined)
          min[`${base}.startedAt`] = new Date(j.startedAt);
        if (j.contextWorldId !== undefined)
          firstWrite.push({
            path: `${base}.contextWorldId`,
            value: j.contextWorldId,
          });
        if (j.steps) {
          const sKeys = Object.keys(j.steps);
          assertSafeKeys(sKeys);
          if (sKeys.length > 50)
            throw new BadRequestException('Příliš mnoho kroků');
          for (const sId of sKeys) {
            const v = j.steps[sId];
            if (!isIso(v))
              throw new BadRequestException(`Krok ${sId}: neplatné datum`);
            min[`${base}.steps.${encKey(sId)}`] = new Date(v);
          }
        }
        if (j.pausedAt !== undefined)
          set[`${base}.pausedAt`] =
            j.pausedAt === null ? null : new Date(j.pausedAt);
        if (j.dismissedAt !== undefined)
          set[`${base}.dismissedAt`] =
            j.dismissedAt === null ? null : new Date(j.dismissedAt);
      }
    }

    const update: UpdateQuery<UserOnboardingDocument> = {
      $setOnInsert: { userId },
    };
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(min).length) update.$min = min;
    if (Object.keys(addToSet).length) update.$addToSet = addToSet;

    await this.model.updateOne({ userId }, update, { upsert: true });

    // First-write-wins pole — pipeline update ($ifNull) zvlášť; idempotentní.
    // Mongoose 9: pole jako update vyžaduje explicitní `updatePipeline: true`.
    for (const fw of firstWrite) {
      await this.model.updateOne(
        { userId },
        [{ $set: { [fw.path]: { $ifNull: [`$${fw.path}`, fw.value] } } }],
        { updatePipeline: true },
      );
    }

    const doc = await this.model.findOne({ userId }).lean();
    // Doc po upsertu existuje vždy; pojistka kvůli typu.
    if (!doc) throw new BadRequestException('Stav se nepodařilo uložit');
    return this.toEntity(doc);
  }

  /**
   * Self-delete cleanup (project_self_deletion_architecture).
   * D11: maže i telemetrii — jinak by osobní identifikátor přežil účet (GDPR).
   */
  @OnEvent('user.deletion.requested')
  async onUserDeleted(payload: { userId: string }): Promise<void> {
    await this.model.deleteOne({ userId: payload.userId });
    await this.telemetry.deleteMany({ userId: payload.userId });
    this.logger.log(
      `user-onboarding + telemetrie smazány pro ${payload.userId}`,
    );
  }

  /** Whitelist ven (be_field_check) + dekódování escapovaných klíčů. */
  private toEntity(
    doc: UserOnboardingSchemaClass & { updatedAt?: Date },
  ): OnboardingEntity {
    const iso = (d: Date | string | null | undefined): string | null =>
      d ? new Date(d).toISOString() : null;
    const journeys: OnboardingEntity['journeys'] = {};
    for (const [k, j] of Object.entries(doc.journeys ?? {})) {
      const jp = j;
      const steps: Record<string, string> = {};
      for (const [sk, sv] of Object.entries(jp.steps ?? {})) {
        const at = iso(sv);
        if (at) steps[decKey(sk)] = at;
      }
      journeys[decKey(k)] = {
        startedAt: iso(jp.startedAt) ?? new Date(0).toISOString(),
        ...(jp.contextWorldId ? { contextWorldId: jp.contextWorldId } : {}),
        steps,
        pausedAt: iso(jp.pausedAt),
        dismissedAt: iso(jp.dismissedAt),
      };
    }
    const milestones: Record<string, string> = {};
    for (const [k, v] of Object.entries(doc.milestones ?? {})) {
      const at = iso(v);
      if (at) milestones[decKey(k)] = at;
    }
    return {
      persona: doc.persona ?? null,
      journeys,
      seenRoutes: doc.seenRoutes ?? [],
      dismissed: doc.dismissed ?? [],
      milestones,
      mode: doc.mode ?? 'active',
      ...(doc.lastSeenChangelog
        ? { lastSeenChangelog: doc.lastSeenChangelog }
        : {}),
      backfilled: doc.backfilled ?? false,
      updatedAt: iso(doc.updatedAt) ?? new Date().toISOString(),
    };
  }
}
