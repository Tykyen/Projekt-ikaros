import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorldOperationsService } from './world-operations.service';
import { MapOperationsService } from './map-operations.service';
import { OperationPayloadValidator } from './operation-payload-validator.service';
import { OperationsAuthorizer } from './operations-authorizer.service';
import { MapsGateway } from '../maps.gateway';
import { UserRole } from '../../users/interfaces/user.interface';
import type { MapScene, MapToken } from '../interfaces/map-scene.interface';

/**
 * D-NEW-INV-MAPS — testy cross-scene ops se zaměřením na undo bulk assignu:
 * `member.bulkAssignToScene` musí vracet inverse `member.bulkRestoreAssignments`
 * s PŮVODNÍM per-member přiřazením a jeho apply musí přiřazení obnovit.
 * Vzor mocků: map-operations.service.spec.ts.
 */

const makeScene = (
  id: string,
  overrides: Partial<MapScene> = {},
): MapScene => ({
  id,
  worldId: 'world1',
  name: `Scéna ${id}`,
  imageUrl: '',
  config: { size: 40, originX: 0, originY: 0, showGrid: true },
  tokens: [],
  npcTemplates: [],
  effects: [],
  fogEnabled: false,
  revealedHexes: [],
  isActive: true,
  isHidden: false,
  isLocked: false,
  playerStates: [],
  activeSoundIds: [],
  lastSeqNumber: 0,
  activeCharacterIds: [],
  activeBestieIds: [],
  ...overrides,
});

const makeToken = (id: string, characterId: string): MapToken => ({
  id,
  characterId,
  characterSlug: 'slug',
  q: 0,
  r: 0,
  isNpc: false,
  currentHp: 0,
  maxHp: 0,
  baseHp: 0,
  armor: 0,
  baseArmor: 0,
  injury: 0,
  initiative: 0,
  initiativeBase: 0,
  inCombat: false,
  movement: 5,
  abilities: [],
  customData: {},
});

describe('WorldOperationsService', () => {
  let service: WorldOperationsService;

  // Stavové mocky — memberships jako mutable mapa (roundtrip test potřebuje,
  // aby setCurrentScene* reálně měnily stav čtený findByUserAndWorld).
  let membershipState: Record<string, string | null>;
  let scenes: Record<string, MapScene>;

  const mockMapsRepo = {
    findById: jest.fn(
      (id: string): Promise<MapScene | null> =>
        Promise.resolve(scenes[id] ?? null),
    ),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn((userId: string, _worldId: string) =>
      Promise.resolve(
        userId in membershipState
          ? { userId, currentSceneId: membershipState[userId] }
          : null,
      ),
    ),
    setCurrentScene: jest.fn(
      (userId: string, _worldId: string, sceneId: string | null) => {
        membershipState[userId] = sceneId;
        return Promise.resolve(null);
      },
    ),
    setCurrentSceneForMany: jest.fn(
      (userIds: string[], _worldId: string, sceneId: string | null) => {
        for (const uid of userIds) membershipState[uid] = sceneId;
        return Promise.resolve(null);
      },
    ),
  };
  const mockOpsRepo = {
    allocateSeqNumber: jest.fn().mockResolvedValue(1),
    appendOperation: jest
      .fn()
      .mockImplementation((record: Record<string, unknown>) =>
        Promise.resolve({ id: 'wrec1', ...record }),
      ),
    findSince: jest.fn(),
  };
  const mockAuthorizer = {
    assertCanDoWorldOp: jest.fn().mockResolvedValue(undefined),
  };
  const mockMapOps = {
    apply: jest.fn().mockResolvedValue({ recordId: 'cascade1' }),
  };
  const mockGateway = {
    emitWorldOperation: jest.fn(),
    emitReassigned: jest.fn(),
  };

  const pj = { id: 'pj', role: UserRole.Hrac }; // role gate řeší authorizer mock

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOpsRepo.allocateSeqNumber.mockResolvedValue(1);
    mockOpsRepo.appendOperation.mockImplementation(
      (record: Record<string, unknown>) =>
        Promise.resolve({ id: 'wrec1', ...record }),
    );
    mockMapOps.apply.mockResolvedValue({ recordId: 'cascade1' });

    // Výchozí svět: u1 na sceneA (má tam token), u2 bez scény.
    membershipState = { u1: 'sceneA', u2: null };
    scenes = {
      sceneA: makeScene('sceneA', {
        tokens: [makeToken('tok1', 'u1')],
      }),
      sceneB: makeScene('sceneB'),
    };

    const module = await Test.createTestingModule({
      providers: [
        WorldOperationsService,
        OperationPayloadValidator,
        { provide: 'IMapsRepository', useValue: mockMapsRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldOperationsRepository', useValue: mockOpsRepo },
        { provide: OperationsAuthorizer, useValue: mockAuthorizer },
        { provide: MapOperationsService, useValue: mockMapOps },
        { provide: MapsGateway, useValue: mockGateway },
      ],
    }).compile();
    service = module.get(WorldOperationsService);
  });

  describe('member.bulkAssignToScene — inverse (D-NEW-INV-MAPS)', () => {
    it('vrací inverse bulkRestore s PŮVODNÍM per-member přiřazením', async () => {
      const result = await service.apply(
        'world1',
        {
          type: 'member.bulkAssignToScene',
          userIds: ['u1', 'u2'],
          sceneId: 'sceneB',
        },
        pj,
      );

      expect(result.inverse).toEqual({
        type: 'member.bulkRestoreAssignments',
        assignments: [
          { userId: 'u1', sceneId: 'sceneA' },
          { userId: 'u2', sceneId: null },
        ],
      });
      // Bulk zápis proběhl + cascade token.remove z u1 staré scény
      expect(mockMembershipRepo.setCurrentSceneForMany).toHaveBeenCalledWith(
        ['u1', 'u2'],
        'world1',
        'sceneB',
      );
      expect(mockMapOps.apply).toHaveBeenCalledWith(
        'sceneA',
        { type: 'token.remove', tokenId: 'tok1' },
        pj,
      );
      expect(result.cascadeMapOpIds).toEqual(['cascade1']);
    });
  });

  describe('member.bulkRestoreAssignments (D-NEW-INV-MAPS)', () => {
    it('obnoví per-member přiřazení (scéna i unassign) + emituje reassigned', async () => {
      membershipState = { u1: 'sceneB', u2: 'sceneB' };

      const result = await service.apply(
        'world1',
        {
          type: 'member.bulkRestoreAssignments',
          assignments: [
            { userId: 'u1', sceneId: 'sceneA' },
            { userId: 'u2', sceneId: null },
          ],
        },
        pj,
      );

      expect(membershipState).toEqual({ u1: 'sceneA', u2: null });
      expect(mockGateway.emitReassigned).toHaveBeenCalledWith('u1', 'sceneA');
      expect(mockGateway.emitReassigned).toHaveBeenCalledWith('u2', null);
      // Vlastní inverse = restore zpět na stav před (redo-friendly)
      expect(result.inverse).toEqual({
        type: 'member.bulkRestoreAssignments',
        assignments: [
          { userId: 'u1', sceneId: 'sceneB' },
          { userId: 'u2', sceneId: 'sceneB' },
        ],
      });
    });

    it('undo roundtrip: bulkAssign → apply inverse → původní přiřazení zpět', async () => {
      // Výchozí stav: u1@sceneA, u2 bez scény
      const assigned = await service.apply(
        'world1',
        {
          type: 'member.bulkAssignToScene',
          userIds: ['u1', 'u2'],
          sceneId: 'sceneB',
        },
        pj,
      );
      expect(membershipState).toEqual({ u1: 'sceneB', u2: 'sceneB' });

      // Undo — apply inverse
      const undone = await service.apply('world1', assigned.inverse, pj);

      expect(membershipState).toEqual({ u1: 'sceneA', u2: null });
      // Redo inverse míří zpět na sceneB
      expect(undone.inverse).toEqual({
        type: 'member.bulkRestoreAssignments',
        assignments: [
          { userId: 'u1', sceneId: 'sceneB' },
          { userId: 'u2', sceneId: 'sceneB' },
        ],
      });
    });

    it('cílová scéna neexistuje → 404, žádný zápis', async () => {
      await expect(
        service.apply(
          'world1',
          {
            type: 'member.bulkRestoreAssignments',
            assignments: [{ userId: 'u1', sceneId: 'neexistuje' }],
          },
          pj,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockMembershipRepo.setCurrentScene).not.toHaveBeenCalled();
    });

    it('member není ve světě → 404 MAP_MEMBER_NOT_FOUND', async () => {
      await expect(
        service.apply(
          'world1',
          {
            type: 'member.bulkRestoreAssignments',
            assignments: [{ userId: 'cizinec', sceneId: 'sceneA' }],
          },
          pj,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('cascade token.remove jen když se scéna reálně mění', async () => {
      // u1 zůstává na sceneA (restore na tutéž scénu) → žádná cascade
      membershipState = { u1: 'sceneA' };

      await service.apply(
        'world1',
        {
          type: 'member.bulkRestoreAssignments',
          assignments: [{ userId: 'u1', sceneId: 'sceneA' }],
        },
        pj,
      );

      expect(mockMapOps.apply).not.toHaveBeenCalled();
      expect(membershipState.u1).toBe('sceneA');
    });
  });
});
