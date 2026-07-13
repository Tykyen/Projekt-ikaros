import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MapOperationsService } from './map-operations.service';
import { OperationPayloadValidator } from './operation-payload-validator.service';
import { OperationsAuthorizer } from './operations-authorizer.service';
import { MapsGateway } from '../maps.gateway';
import { SystemStatsValidatorService } from '../schemas/system-entity-schema/system-stats-validator.service';
import { UserRole } from '../../users/interfaces/user.interface';
import type { MapScene } from '../interfaces/map-scene.interface';

const makeScene = (overrides: Partial<MapScene> = {}): MapScene => ({
  id: 'scene1',
  worldId: 'world1',
  name: 'Test',
  imageUrl: '',
  config: { size: 40, originX: 0, originY: 0, showGrid: true },
  tokens: [],
  npcTemplates: [],
  effects: [],
  fogEnabled: false,
  revealedHexes: [],
  isActive: false,
  isHidden: false,
  isLocked: false,
  playerStates: [],
  activeSoundIds: [],
  lastSeqNumber: 0,
  activeCharacterIds: [],
  activeBestieIds: [],
  ...overrides,
});

const makeToken = (id: string, characterId: string, q = 0, r = 0) => ({
  id,
  characterId,
  characterSlug: 'abc',
  q,
  r,
  isNpc: false,
  currentHp: 10,
  maxHp: 10,
  baseHp: 10,
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

describe('MapOperationsService', () => {
  let service: MapOperationsService;
  const mockMapsRepo = {
    findByWorld: jest.fn(),
    findActiveByWorld: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    setActive: jest.fn(),
    replace: jest.fn(),
    delete: jest.fn(),
    atomicUpdate: jest.fn().mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    }),
    // D-LAUNCH-GAP — server-side HP delta (pipeline update + post-update fetch)
    atomicUpdateAndFetch: jest.fn(),
    findActiveScenesByWorld: jest.fn(),
  };
  const mockOpsRepo = {
    allocateSeqNumber: jest.fn().mockResolvedValue(1),
    appendOperation: jest
      .fn()
      .mockImplementation((record) =>
        Promise.resolve({ id: 'rec1', ...record }),
      ),
    findSince: jest.fn(),
    // D-DROBNE-UNDO
    findLastUndoableByUser: jest.fn(),
    markUndone: jest.fn(),
  };
  const mockGateway = {
    emitMapOperation: jest.fn(),
    // 10.2c-edit-1 — scene.deactivate cascade emits world:operation + reassigned
    emitWorldOperation: jest.fn(),
    emitReassigned: jest.fn(),
  };
  const mockAuthorizer = {
    assertCanDo: jest.fn().mockResolvedValue(undefined),
    // D-DROBNE-UNDO
    assertCanUndo: jest.fn().mockResolvedValue(undefined),
  };
  const mockWorldsRepo = {
    findById: jest.fn(),
  };
  const mockStatsValidator = {
    validate: jest.fn(),
  };
  // 10.2c-edit-1 — pro scene.deactivate cascade
  const mockMembershipRepo = {
    findByWorldId: jest.fn().mockResolvedValue([]),
    setCurrentScene: jest.fn().mockResolvedValue(null),
  };
  const mockWorldOpsRepo = {
    allocateSeqNumber: jest.fn().mockResolvedValue(1),
    appendOperation: jest
      .fn()
      .mockImplementation((record) =>
        Promise.resolve({ id: 'wrec1', ...record }),
      ),
  };
  const mockEventEmitter = { emit: jest.fn() };
  // D-NEW-INV-DATA-SYNC — token HP PC/NPC → diary customData
  const mockCharactersRepo = {
    findBySlugAndWorld: jest.fn(),
  };
  const mockDiaryRepo = {
    findByCharacterId: jest.fn(),
    updateWithCustomDataPatch: jest.fn(),
  };

  const pj = { id: 'pj', role: UserRole.Hrac }; // role gating se děje v authorizer mock

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOpsRepo.allocateSeqNumber.mockResolvedValue(1);
    mockOpsRepo.appendOperation.mockImplementation((record) =>
      Promise.resolve({ id: 'rec1', ...record }),
    );
    mockMapsRepo.atomicUpdate.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });
    mockMapsRepo.atomicUpdateAndFetch.mockResolvedValue(null);
    // D-DROBNE-UNDO — deterministické defaulty
    mockOpsRepo.findLastUndoableByUser.mockResolvedValue(null);
    mockOpsRepo.markUndone.mockResolvedValue(undefined);
    mockAuthorizer.assertCanUndo.mockResolvedValue(undefined);

    mockMembershipRepo.findByWorldId.mockResolvedValue([]);
    mockMembershipRepo.setCurrentScene.mockResolvedValue(null);
    mockWorldOpsRepo.allocateSeqNumber.mockResolvedValue(1);
    mockWorldOpsRepo.appendOperation.mockImplementation((record) =>
      Promise.resolve({ id: 'wrec1', ...record }),
    );
    // D-NEW-INV-DATA-SYNC — deterministické defaulty (clearAllMocks nemaže
    // implementace; bez re-setu by mockResolvedValue z jednoho testu prosákl).
    mockWorldsRepo.findById.mockResolvedValue(null);
    mockCharactersRepo.findBySlugAndWorld.mockResolvedValue(null);
    mockDiaryRepo.findByCharacterId.mockResolvedValue(null);
    mockDiaryRepo.updateWithCustomDataPatch.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        MapOperationsService,
        OperationPayloadValidator,
        { provide: 'IMapsRepository', useValue: mockMapsRepo },
        { provide: 'IMapOperationsRepository', useValue: mockOpsRepo },
        { provide: OperationsAuthorizer, useValue: mockAuthorizer },
        { provide: MapsGateway, useValue: mockGateway },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        {
          provide: SystemStatsValidatorService,
          useValue: mockStatsValidator,
        },
        // 10.2c-edit-1
        {
          provide: 'IWorldMembershipRepository',
          useValue: mockMembershipRepo,
        },
        {
          provide: 'IWorldOperationsRepository',
          useValue: mockWorldOpsRepo,
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        // D-NEW-INV-DATA-SYNC
        { provide: 'ICharactersRepository', useValue: mockCharactersRepo },
        { provide: 'ICharacterDiaryRepository', useValue: mockDiaryRepo },
      ],
    }).compile();
    service = module.get(MapOperationsService);
  });

  describe('apply — happy path', () => {
    it('token.move: validate → load → authorize → atomic update → log → broadcast', async () => {
      const scene = makeScene({ tokens: [makeToken('t1', 'pj', 3, -1)] });
      mockMapsRepo.findById.mockResolvedValue(scene);

      const result = await service.apply(
        'scene1',
        { type: 'token.move', tokenId: 't1', q: 5, r: -2 },
        pj,
      );

      expect(mockAuthorizer.assertCanDo).toHaveBeenCalled();
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1', 'tokens.id': 't1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            'tokens.$.q': 5,
            'tokens.$.r': -2,
          }) as Record<string, unknown>,
        }),
      );
      expect(mockOpsRepo.allocateSeqNumber).toHaveBeenCalledWith('scene1');
      expect(mockOpsRepo.appendOperation).toHaveBeenCalled();
      expect(mockGateway.emitMapOperation).toHaveBeenCalledWith('scene1', {
        sceneId: 'scene1',
        seqNumber: 1,
        op: expect.objectContaining({
          type: 'token.move',
        }) as unknown,
        byUserId: 'pj',
        appliedAt: expect.any(Date) as Date,
      });
      expect(result.seqNumber).toBe(1);
      expect(result.inverse).toEqual({
        type: 'token.move',
        tokenId: 't1',
        q: 3,
        r: -1,
      });
    });

    it('token.remove: inverse je snapshot tokenu', async () => {
      const token = makeToken('t1', 'pj', 5, 3);
      const scene = makeScene({ tokens: [token] });
      mockMapsRepo.findById.mockResolvedValue(scene);

      const result = await service.apply(
        'scene1',
        { type: 'token.remove', tokenId: 't1' },
        pj,
      );

      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $pull: { tokens: { id: 't1' } },
        }),
      );
      expect(result.inverse).toEqual({
        type: 'token.add',
        token,
      });
    });

    it('token.update: server clamp — currentHp nad maxHp→maxHp, záporné→0, injury záporná→0 (GI styl 46)', async () => {
      const scene = makeScene({ tokens: [makeToken('t1', 'pj')] }); // maxHp:10
      mockMapsRepo.findById.mockResolvedValue(scene);

      await service.apply(
        'scene1',
        {
          type: 'token.update',
          tokenId: 't1',
          patch: { currentHp: 99999, injury: -3 },
        },
        pj,
      );
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1', 'tokens.id': 't1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            'tokens.$.currentHp': 10,
            'tokens.$.injury': 0,
          }) as Record<string, unknown>,
        }),
      );

      mockMapsRepo.atomicUpdate.mockClear();
      mockMapsRepo.findById.mockResolvedValue(scene);
      await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 't1', patch: { currentHp: -5 } },
        pj,
      );
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1', 'tokens.id': 't1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            'tokens.$.currentHp': 0,
          }) as Record<string, unknown>,
        }),
      );
    });

    it('fog.brush mode=reveal: $addToSet revealedHexes', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene());

      const result = await service.apply(
        'scene1',
        { type: 'fog.brush', mode: 'reveal', hexes: [{ q: 0, r: 0 }] },
        pj,
      );

      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $addToSet: { revealedHexes: { $each: [{ q: 0, r: 0 }] } },
        }),
      );
      expect(result.inverse).toEqual({
        type: 'fog.brush',
        mode: 'fog',
        hexes: [{ q: 0, r: 0 }],
      });
    });

    it('scene.state: inverse drží jen ovlivněná pole', async () => {
      const scene = makeScene({ isHidden: false, isLocked: false });
      mockMapsRepo.findById.mockResolvedValue(scene);

      const result = await service.apply(
        'scene1',
        { type: 'scene.state', isHidden: true },
        pj,
      );

      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({ isHidden: true }) as Record<
            string,
            unknown
          >,
        }),
      );
      expect(result.inverse).toEqual({
        type: 'scene.state',
        isHidden: false,
      });
    });

    // 10.2n — per-hráč override
    it('scene.playerState: upsert override (žádný předchozí → inverse clear)', async () => {
      const scene = makeScene({ playerStates: [] });
      mockMapsRepo.findById.mockResolvedValue(scene);

      const result = await service.apply(
        'scene1',
        { type: 'scene.playerState', userId: 'u1', isHidden: true },
        pj,
      );

      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            playerStates: [{ userId: 'u1', isHidden: true }],
          }) as Record<string, unknown>,
        }),
      );
      expect(result.inverse).toEqual({
        type: 'scene.playerState',
        userId: 'u1',
        isHidden: null,
      });
    });

    it('scene.playerState: merge zachová druhé pole', async () => {
      const scene = makeScene({
        playerStates: [{ userId: 'u1', isLocked: true }],
      });
      mockMapsRepo.findById.mockResolvedValue(scene);

      await service.apply(
        'scene1',
        { type: 'scene.playerState', userId: 'u1', isHidden: true },
        pj,
      );

      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            playerStates: [{ userId: 'u1', isLocked: true, isHidden: true }],
          }) as Record<string, unknown>,
        }),
      );
    });

    it('scene.playerState: null smaže pole, prázdný entry zmizí (inverse obnoví)', async () => {
      const scene = makeScene({
        playerStates: [{ userId: 'u1', isHidden: true }],
      });
      mockMapsRepo.findById.mockResolvedValue(scene);

      const result = await service.apply(
        'scene1',
        { type: 'scene.playerState', userId: 'u1', isHidden: null },
        pj,
      );

      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({ playerStates: [] }) as Record<
            string,
            unknown
          >,
        }),
      );
      expect(result.inverse).toEqual({
        type: 'scene.playerState',
        userId: 'u1',
        isHidden: true,
      });
    });
  });

  describe('apply — error paths', () => {
    it('chybějící scéna → MAP_SCENE_NOT_FOUND', async () => {
      mockMapsRepo.findById.mockResolvedValue(null);
      await expect(
        service.apply(
          'badId',
          { type: 'token.move', tokenId: 't1', q: 0, r: 0 },
          pj,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockOpsRepo.allocateSeqNumber).not.toHaveBeenCalled();
    });

    it('atomic update matched=0 (token zmizel mezi load a update) → MAP_TOKEN_NOT_FOUND', async () => {
      const scene = makeScene({ tokens: [makeToken('t1', 'pj')] });
      mockMapsRepo.findById.mockResolvedValue(scene);
      mockMapsRepo.atomicUpdate.mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
      });
      await expect(
        service.apply(
          'scene1',
          { type: 'token.move', tokenId: 't1', q: 0, r: 0 },
          pj,
        ),
      ).rejects.toThrow(NotFoundException);
      // Counter NE-allocated po failed apply
      expect(mockOpsRepo.allocateSeqNumber).not.toHaveBeenCalled();
    });

    it('seqNumber se neallocuje při authorize fail', async () => {
      const scene = makeScene();
      mockMapsRepo.findById.mockResolvedValue(scene);
      mockAuthorizer.assertCanDo.mockRejectedValueOnce(new Error('FORBIDDEN'));
      await expect(
        service.apply(
          'scene1',
          { type: 'effect.add', effect: { id: 'e1', type: 'color' } },
          pj,
        ),
      ).rejects.toThrow();
      expect(mockMapsRepo.atomicUpdate).not.toHaveBeenCalled();
      expect(mockOpsRepo.allocateSeqNumber).not.toHaveBeenCalled();
    });
  });

  describe('apply — combat semantics', () => {
    it('combat.start na již aktivním combat → PRECONDITION_FAILED', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ combat: { isActive: true, order: [], round: 1 } }),
      );
      await expect(
        service.apply(
          'scene1',
          { type: 'combat.start', orderTokenIds: ['t1'] },
          pj,
        ),
      ).rejects.toThrow(/aktivní/);
    });

    it('combat.start s neexistujícím tokenId v orderTokenIds → INVALID', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene());
      await expect(
        service.apply(
          'scene1',
          { type: 'combat.start', orderTokenIds: ['xyz'] },
          pj,
        ),
      ).rejects.toThrow();
    });

    it('combat.end bez aktivního combat → PRECONDITION_FAILED', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene({ combat: null }));
      await expect(
        service.apply('scene1', { type: 'combat.end' }, pj),
      ).rejects.toThrow(/aktivní/);
    });
  });

  // 10.2f-2 — přeřazení order za běžícího boje (zachovává round/currentTokenId)
  describe('apply — combat.reorder', () => {
    const activeScene = () =>
      makeScene({
        tokens: [
          makeToken('t1', 'c1'),
          makeToken('t2', 'c2'),
          makeToken('t3', 'c3'),
        ],
        combat: {
          isActive: true,
          round: 3,
          currentTokenId: 't2',
          order: ['t1', 't2', 't3'],
          endOfTurnEffects: [],
        },
      });

    it('happy path: přepíše jen combat.order, NE round/currentTokenId', async () => {
      mockMapsRepo.findById.mockResolvedValue(activeScene());
      const res = await service.apply(
        'scene1',
        { type: 'combat.reorder', orderTokenIds: ['t3', 't1', 't2'] },
        pj,
      );
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        {
          $set: expect.objectContaining({
            'combat.order': ['t3', 't1', 't2'],
          }),
        },
      );
      // round/currentTokenId NESMÍ být v $set
      const setArg = mockMapsRepo.atomicUpdate.mock.calls[0][1].$set;
      expect(setArg['combat.round']).toBeUndefined();
      expect(setArg['combat.currentTokenId']).toBeUndefined();
      // inverse = reorder zpět na původní pořadí
      expect(res.inverse).toEqual({
        type: 'combat.reorder',
        orderTokenIds: ['t1', 't2', 't3'],
      });
    });

    it('bez aktivního boje → PRECONDITION_FAILED', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene({ combat: null }));
      await expect(
        service.apply(
          'scene1',
          { type: 'combat.reorder', orderTokenIds: ['t1'] },
          pj,
        ),
      ).rejects.toThrow(/aktivní/);
    });

    it('orderTokenIds není permutace (cizí token) → INVALID', async () => {
      mockMapsRepo.findById.mockResolvedValue(activeScene());
      await expect(
        service.apply(
          'scene1',
          { type: 'combat.reorder', orderTokenIds: ['t1', 't2', 'xyz'] },
          pj,
        ),
      ).rejects.toThrow();
      expect(mockMapsRepo.atomicUpdate).not.toHaveBeenCalled();
    });

    it('orderTokenIds má jinou délku (subset) → INVALID', async () => {
      mockMapsRepo.findById.mockResolvedValue(activeScene());
      await expect(
        service.apply(
          'scene1',
          { type: 'combat.reorder', orderTokenIds: ['t1', 't2'] },
          pj,
        ),
      ).rejects.toThrow();
      expect(mockMapsRepo.atomicUpdate).not.toHaveBeenCalled();
    });
  });

  // 10.2c-edit-1 C4 — scene.deactivate s cascade unassign + idempotence
  describe('apply — scene.deactivate', () => {
    it('happy path: aktivní scéna → CAS isActive=false, cascade unassign N affected', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ isActive: true, lastSeqNumber: 5 }),
      );
      mockMapsRepo.atomicUpdate.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });
      // 3 hráči na scene1, 1 hráč jinde
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'u1', currentSceneId: 'scene1' },
        { userId: 'u2', currentSceneId: 'scene1' },
        { userId: 'u3', currentSceneId: 'sceneJina' },
        { userId: 'u4', currentSceneId: 'scene1' },
      ]);

      const result = await service.apply(
        'scene1',
        { type: 'scene.deactivate' },
        pj,
      );

      expect(result.applied).not.toBe(false); // happy = applied:true (nebo undefined)
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1', isActive: true },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: false }) as unknown,
        }),
      );
      // 3 affected (u1, u2, u4); u3 přeskočen
      expect(mockMembershipRepo.setCurrentScene).toHaveBeenCalledTimes(3);
      expect(mockMembershipRepo.setCurrentScene).toHaveBeenCalledWith(
        'u1',
        'world1',
        null,
      );
      expect(mockMembershipRepo.setCurrentScene).toHaveBeenCalledWith(
        'u2',
        'world1',
        null,
      );
      expect(mockMembershipRepo.setCurrentScene).toHaveBeenCalledWith(
        'u4',
        'world1',
        null,
      );
      // World ops log: 3× appendOperation
      expect(mockWorldOpsRepo.appendOperation).toHaveBeenCalledTimes(3);
      // WS broadcasty
      expect(mockGateway.emitWorldOperation).toHaveBeenCalledTimes(3);
      expect(mockGateway.emitReassigned).toHaveBeenCalledTimes(3);
      expect(mockGateway.emitReassigned).toHaveBeenCalledWith('u1', null);
      expect(mockGateway.emitReassigned).toHaveBeenCalledWith('u2', null);
      expect(mockGateway.emitReassigned).toHaveBeenCalledWith('u4', null);
      // Map operation log + broadcast (z apply() po applyAtomic)
      expect(mockOpsRepo.appendOperation).toHaveBeenCalledTimes(1);
      expect(mockGateway.emitMapOperation).toHaveBeenCalledTimes(1);
    });

    it('idempotent: scéna už neaktivní → applied:false, žádný log/broadcast/cascade', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ isActive: false, lastSeqNumber: 7 }),
      );
      // CAS na isActive: true → match miss
      mockMapsRepo.atomicUpdate.mockResolvedValueOnce({
        matchedCount: 0,
        modifiedCount: 0,
      });

      const result = await service.apply(
        'scene1',
        { type: 'scene.deactivate' },
        pj,
      );

      expect(result.applied).toBe(false);
      expect(result.seqNumber).toBe(7); // vrátí current
      // Žádný side-effect
      expect(mockMembershipRepo.setCurrentScene).not.toHaveBeenCalled();
      expect(mockWorldOpsRepo.appendOperation).not.toHaveBeenCalled();
      expect(mockGateway.emitWorldOperation).not.toHaveBeenCalled();
      expect(mockGateway.emitReassigned).not.toHaveBeenCalled();
      expect(mockOpsRepo.appendOperation).not.toHaveBeenCalled();
      expect(mockGateway.emitMapOperation).not.toHaveBeenCalled();
    });

    it('happy path bez affected hráčů: jen scéna se deaktivuje', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ isActive: true, lastSeqNumber: 0 }),
      );
      mockMapsRepo.atomicUpdate.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });
      mockMembershipRepo.findByWorldId.mockResolvedValue([]);

      const result = await service.apply(
        'scene1',
        { type: 'scene.deactivate' },
        pj,
      );

      expect(result.applied).not.toBe(false);
      expect(mockMembershipRepo.setCurrentScene).not.toHaveBeenCalled();
      expect(mockWorldOpsRepo.appendOperation).not.toHaveBeenCalled();
      expect(mockGateway.emitMapOperation).toHaveBeenCalledTimes(1);
    });

    it('worldOps record obsahuje correct inverse pro každého affected', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ isActive: true, lastSeqNumber: 0 }),
      );
      mockMapsRepo.atomicUpdate.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'u1', currentSceneId: 'scene1' },
      ]);

      await service.apply('scene1', { type: 'scene.deactivate' }, pj);

      expect(mockWorldOpsRepo.appendOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          op: { type: 'member.unassign', userId: 'u1' },
          inverse: {
            type: 'member.assignToScene',
            userId: 'u1',
            sceneId: 'scene1',
          },
          byUserId: 'pj',
        }),
      );
    });
  });

  // 10.2j B3 — dice.roll applyAtomic + computeInverse no-op
  describe('apply — dice.roll (10.2j)', () => {
    const roll = {
      id: 'r1',
      rolledAt: '2026-05-31T08:00:00.000Z',
      byUserId: 'u1',
      rollerName: 'Tyky',
      rollerKind: 'pc' as const,
      category: 'custom' as const,
      dicePayload: { type: 'd20', faces: [18], sum: 18, total: 18 },
    };

    it('atomic $push + $slice -50 do diceRolls', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene());

      await service.apply('scene1', { type: 'dice.roll', roll }, pj);

      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $push: {
            diceRolls: {
              $each: [expect.objectContaining({ id: 'r1' })],
              $slice: -50,
            },
          },
          $set: expect.objectContaining({ lastModified: expect.any(Date) }),
        }),
      );
    });

    it('computeInverse je no-op (hody nejsou undo-relevantní)', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene());

      const result = await service.apply(
        'scene1',
        { type: 'dice.roll', roll },
        pj,
      );

      expect(result.inverse).toBeNull();
    });
  });

  // 10.2c-edit-2 C6 — load template sekvence (5 nových op types)
  describe('apply — load template ops (10.2c-edit-2)', () => {
    beforeEach(() => {
      mockMapsRepo.findById.mockResolvedValue(makeScene());
    });

    it('scene.fog.replace: atomic set fogEnabled + revealedHexes, inverse snapshot', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({
          fogEnabled: false,
          revealedHexes: [{ q: 1, r: 2 }],
        }),
      );
      const result = await service.apply(
        'scene1',
        {
          type: 'scene.fog.replace',
          fogEnabled: true,
          revealedHexes: [
            { q: 0, r: 0 },
            { q: 3, r: -2 },
          ],
        },
        pj,
      );
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            fogEnabled: true,
            revealedHexes: [
              { q: 0, r: 0 },
              { q: 3, r: -2 },
            ],
          }) as unknown,
        }),
      );
      expect(result.inverse).toEqual({
        type: 'scene.fog.replace',
        fogEnabled: false,
        revealedHexes: [{ q: 1, r: 2 }],
      });
    });

    it('scene.effects.replace: atomic set effects, inverse snapshot', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({
          effects: [{ id: 'e1', type: 'color', color: 'red', hexes: [] }],
        }),
      );
      const result = await service.apply(
        'scene1',
        {
          type: 'scene.effects.replace',
          effects: [{ id: 'e2', type: 'barrier' }],
        },
        pj,
      );
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            effects: [{ id: 'e2', type: 'barrier' }],
          }) as unknown,
        }),
      );
      expect(result.inverse).toEqual({
        type: 'scene.effects.replace',
        effects: [{ id: 'e1', type: 'color', color: 'red', hexes: [] }],
      });
    });

    it('scene.npc-templates.replace: bulk set npcTemplates', async () => {
      const result = await service.apply(
        'scene1',
        {
          type: 'scene.npc-templates.replace',
          npcTemplates: [{ id: 'n1', name: 'Goblin' }],
        },
        pj,
      );
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            npcTemplates: [{ id: 'n1', name: 'Goblin' }],
          }) as unknown,
        }),
      );
      expect(result.inverse).toEqual({
        type: 'scene.npc-templates.replace',
        npcTemplates: [],
      });
    });

    it('scene.tokens.replace-npc: zachová PC + nahradí NPC, filtruje PC z payloadu', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({
          tokens: [
            { ...makeToken('pc1', 'u1'), isNpc: false },
            { ...makeToken('npc1', 'tpl1'), isNpc: true },
          ],
        }),
      );
      await service.apply(
        'scene1',
        {
          type: 'scene.tokens.replace-npc',
          tokens: [
            // Payload má jeden NPC + jeden falsy PC (musí být odfiltrován)
            { id: 'npcNew1', characterId: 'tpl2', isNpc: true },
            { id: 'pcSneak', characterId: 'evil', isNpc: false },
          ],
        },
        pj,
      );
      // Volání s tokens = [existing PC, payload NPC] — bez payload PC
      const call = mockMapsRepo.atomicUpdate.mock.calls.find(
        (c) =>
          (c[1] as { $set?: Record<string, unknown> }).$set?.tokens !==
          undefined,
      );
      expect(call).toBeTruthy();
      const tokens = (call![1] as { $set: { tokens: Array<{ id: string }> } })
        .$set.tokens;
      expect(tokens.map((t) => t.id)).toEqual(['pc1', 'npcNew1']);
    });

    it('scene.sounds.set: atomic set activeSoundIds, inverse snapshot', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ activeSoundIds: ['old1', 'old2'] }),
      );
      const result = await service.apply(
        'scene1',
        {
          type: 'scene.sounds.set',
          activeSoundIds: ['new1'],
        },
        pj,
      );
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            activeSoundIds: ['new1'],
          }) as unknown,
        }),
      );
      expect(result.inverse).toEqual({
        type: 'scene.sounds.set',
        activeSoundIds: ['old1', 'old2'],
      });
    });
  });

  // D-NEW-INV-MAPS — scene.activate (inverse scene.deactivate) + undo roundtrip
  describe('apply — scene.activate / undo roundtrip (D-NEW-INV-MAPS)', () => {
    it('scene.deactivate vrací inverse scene.activate', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene({ isActive: true }));

      const result = await service.apply(
        'scene1',
        { type: 'scene.deactivate' },
        pj,
      );

      expect(result.inverse).toEqual({ type: 'scene.activate' });
    });

    it('undo roundtrip: deactivate → apply inverse → CAS aktivuje zpět', async () => {
      // Krok 1 — deactivate aktivní scény
      mockMapsRepo.findById.mockResolvedValueOnce(
        makeScene({ isActive: true }),
      );
      const deactivated = await service.apply(
        'scene1',
        { type: 'scene.deactivate' },
        pj,
      );
      expect(deactivated.inverse).toEqual({ type: 'scene.activate' });

      // Krok 2 — apply inverse na (nyní neaktivní) scénu
      mockMapsRepo.findById.mockResolvedValueOnce(
        makeScene({ isActive: false }),
      );
      const undone = await service.apply('scene1', deactivated.inverse, pj);

      expect(mockMapsRepo.atomicUpdate).toHaveBeenLastCalledWith(
        { _id: 'scene1', isActive: false },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: true }) as unknown,
        }),
      );
      expect(undone.applied).not.toBe(false);
      // Inverse undo kroku = deactivate (redo-friendly)
      expect(undone.inverse).toEqual({ type: 'scene.deactivate' });
    });

    it('idempotent: activate už aktivní scény → applied:false, žádný log', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ isActive: true, lastSeqNumber: 4 }),
      );
      // CAS na isActive: false → match miss
      mockMapsRepo.atomicUpdate.mockResolvedValueOnce({
        matchedCount: 0,
        modifiedCount: 0,
      });

      const result = await service.apply(
        'scene1',
        { type: 'scene.activate' },
        pj,
      );

      expect(result.applied).toBe(false);
      expect(result.seqNumber).toBe(4);
      expect(mockOpsRepo.appendOperation).not.toHaveBeenCalled();
      expect(mockGateway.emitMapOperation).not.toHaveBeenCalled();
    });
  });

  // D-NEW-INV-MAPS — drawing.clear undo přes scene.drawings.replace
  describe('apply — drawing.clear inverse (D-NEW-INV-MAPS)', () => {
    const drawings = [
      {
        id: 'd1',
        kind: 'line' as const,
        points: [0, 0, 10, 10],
        color: '#ffffff',
        createdByUserId: 'pj',
        visibility: 'all' as const,
      },
    ];

    it('drawing.clear: inverse = scene.drawings.replace se snapshotem', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene({ drawings }));

      const result = await service.apply(
        'scene1',
        { type: 'drawing.clear' },
        pj,
      );

      expect(result.inverse).toEqual({
        type: 'scene.drawings.replace',
        drawings,
      });
    });

    it('undo roundtrip: apply inverse obnoví kresby $setem', async () => {
      mockMapsRepo.findById.mockResolvedValueOnce(makeScene({ drawings }));
      const cleared = await service.apply(
        'scene1',
        { type: 'drawing.clear' },
        pj,
      );

      mockMapsRepo.findById.mockResolvedValueOnce(makeScene({ drawings: [] }));
      await service.apply('scene1', cleared.inverse, pj);

      expect(mockMapsRepo.atomicUpdate).toHaveBeenLastCalledWith(
        { _id: 'scene1' },
        expect.objectContaining({
          $set: expect.objectContaining({ drawings }) as unknown,
        }),
      );
    });
  });

  // D-NEW-INV-DATA-SYNC — token.update HP PC/NPC → diary customData postavy
  describe('apply — token.update → diary HP sync (D-NEW-INV-DATA-SYNC)', () => {
    it('PC token currentHp → updateWithCustomDataPatch s per-system klíčem (dnd5e)', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [makeToken('t1', 'pj')] }),
      );
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        system: 'dnd5e',
      });
      mockCharactersRepo.findBySlugAndWorld.mockResolvedValue({ id: 'char1' });
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        id: 'diary1',
        characterId: 'char1',
        customData: {},
        moderationHidden: false,
      });

      await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 't1', patch: { currentHp: 7 } },
        pj,
      );

      expect(mockCharactersRepo.findBySlugAndWorld).toHaveBeenCalledWith(
        'abc',
        'world1',
      );
      expect(mockDiaryRepo.updateWithCustomDataPatch).toHaveBeenCalledWith(
        'char1',
        {},
        { dnd_hpCur: 7 },
      );
    });

    it('NPC token (isNpc, bez templateId) se syncuje taky (matrix → matrix_health)', async () => {
      const npc = { ...makeToken('t1', 'npc-char'), isNpc: true };
      mockMapsRepo.findById.mockResolvedValue(makeScene({ tokens: [npc] }));
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        system: 'matrix',
      });
      mockCharactersRepo.findBySlugAndWorld.mockResolvedValue({ id: 'char2' });
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        id: 'diary2',
        characterId: 'char2',
        customData: {},
        moderationHidden: false,
      });

      await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 't1', patch: { currentHp: 3 } },
        pj,
      );

      expect(mockDiaryRepo.updateWithCustomDataPatch).toHaveBeenCalledWith(
        'char2',
        {},
        { matrix_health: 3 },
      );
    });

    it('bestie token (templateId / bestie: prefix) → sync se NEDĚLÁ (záměr)', async () => {
      const bestie = {
        ...makeToken('t1', 'bestie:x'),
        templateId: 'tpl1',
        isNpc: true,
      };
      mockMapsRepo.findById.mockResolvedValue(makeScene({ tokens: [bestie] }));
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        system: 'dnd5e',
      });

      await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 't1', patch: { currentHp: 2 } },
        pj,
      );

      expect(mockCharactersRepo.findBySlugAndWorld).not.toHaveBeenCalled();
      expect(mockDiaryRepo.updateWithCustomDataPatch).not.toHaveBeenCalled();
    });

    it('postava bez deníku → skip bez erroru (žádný lazy-create)', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [makeToken('t1', 'pj')] }),
      );
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        system: 'dnd5e',
      });
      mockCharactersRepo.findBySlugAndWorld.mockResolvedValue({ id: 'char1' });
      mockDiaryRepo.findByCharacterId.mockResolvedValue(null);

      const result = await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 't1', patch: { currentHp: 5 } },
        pj,
      );

      expect(result.seqNumber).toBe(1); // op prošla
      expect(mockDiaryRepo.updateWithCustomDataPatch).not.toHaveBeenCalled();
    });

    it('systém bez jednoznačného HP mapování (drd2) → skip', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [makeToken('t1', 'pj')] }),
      );
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        system: 'drd2',
      });

      await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 't1', patch: { currentHp: 5 } },
        pj,
      );

      expect(mockCharactersRepo.findBySlugAndWorld).not.toHaveBeenCalled();
      expect(mockDiaryRepo.updateWithCustomDataPatch).not.toHaveBeenCalled();
    });

    it('selhání diary write nesmí shodit už provedený token update (best-effort)', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [makeToken('t1', 'pj')] }),
      );
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        system: 'dnd5e',
      });
      mockCharactersRepo.findBySlugAndWorld.mockResolvedValue({ id: 'char1' });
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        id: 'diary1',
        characterId: 'char1',
        customData: {},
        moderationHidden: false,
      });
      mockDiaryRepo.updateWithCustomDataPatch.mockRejectedValue(
        new Error('mongo down'),
      );

      const result = await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 't1', patch: { currentHp: 5 } },
        pj,
      );

      expect(result.seqNumber).toBe(1);
      expect(mockOpsRepo.appendOperation).toHaveBeenCalled();
    });

    it('patch bez HP polí (jen initiative) → diary se nesahá', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [makeToken('t1', 'pj')] }),
      );
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        system: 'dnd5e',
      });

      await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 't1', patch: { initiative: 12 } },
        pj,
      );

      expect(mockCharactersRepo.findBySlugAndWorld).not.toHaveBeenCalled();
      expect(mockDiaryRepo.updateWithCustomDataPatch).not.toHaveBeenCalled();
    });
  });

  // D-LAUNCH-GAP — server-side HP/injury delta (fix lost update na tokens.$.currentHp)
  describe('apply — token.update hpDelta/injuryDelta (D-LAUNCH-GAP)', () => {
    const bestieToken = () => ({
      ...makeToken('b1', 'bestie:tpl'),
      isNpc: true,
      templateId: 'tpl1',
    }); // currentHp 10 / maxHp 10 z makeToken

    it('hpDelta: pipeline update přes atomicUpdateAndFetch, op normalizován na FINÁLNÍ absolutní hodnotu, inverse nese starou', async () => {
      const scene = makeScene({ tokens: [bestieToken()] });
      mockMapsRepo.findById.mockResolvedValue(scene);
      mockMapsRepo.atomicUpdateAndFetch.mockResolvedValue(
        makeScene({ tokens: [{ ...bestieToken(), currentHp: 7 }] }),
      );

      const result = await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 'b1', patch: {}, hpDelta: -3 },
        pj,
      );

      // Atomický pipeline update (array), žádný klasický $set na currentHp
      expect(mockMapsRepo.atomicUpdateAndFetch).toHaveBeenCalledWith(
        { _id: 'scene1', 'tokens.id': 'b1' },
        expect.any(Array),
      );
      expect(mockMapsRepo.atomicUpdate).not.toHaveBeenCalled();
      // Normalizace: response/log/broadcast nesou výslednou absolutní hodnotu
      // (stávající FE zná jen patch — delta by se mu neaplikovala)
      expect(
        (result.op as { patch: Record<string, unknown> }).patch.currentHp,
      ).toBe(7);
      const logged = mockOpsRepo.appendOperation.mock.calls[0][0] as {
        op: { patch: Record<string, unknown> };
      };
      expect(logged.op.patch.currentHp).toBe(7);
      const broadcast = mockGateway.emitMapOperation.mock.calls[0][1] as {
        op: { patch: Record<string, unknown> };
      };
      expect(broadcast.op.patch.currentHp).toBe(7);
      // Inverse (undo) = stará absolutní hodnota ze snapshotu
      expect(result.inverse).toEqual({
        type: 'token.update',
        tokenId: 'b1',
        patch: { currentHp: 10 },
      });
    });

    it('injuryDelta: normalizuje injury z výsledku + inverse nese starou injury', async () => {
      const scene = makeScene({ tokens: [{ ...bestieToken(), injury: 1 }] });
      mockMapsRepo.findById.mockResolvedValue(scene);
      mockMapsRepo.atomicUpdateAndFetch.mockResolvedValue(
        makeScene({ tokens: [{ ...bestieToken(), injury: 3 }] }),
      );

      const result = await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 'b1', patch: {}, injuryDelta: 2 },
        pj,
      );

      expect(
        (result.op as { patch: Record<string, unknown> }).patch.injury,
      ).toBe(3);
      expect(result.inverse).toEqual({
        type: 'token.update',
        tokenId: 'b1',
        patch: { injury: 1 },
      });
    });

    it('hpDelta + neprázdný patch → 400 MAP_OP_INVALID (nejednoznačná kombinace)', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [bestieToken()] }),
      );
      await expect(
        service.apply(
          'scene1',
          {
            type: 'token.update',
            tokenId: 'b1',
            patch: { currentHp: 5 },
            hpDelta: -1,
          },
          pj,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockMapsRepo.atomicUpdateAndFetch).not.toHaveBeenCalled();
      expect(mockMapsRepo.atomicUpdate).not.toHaveBeenCalled();
      expect(mockOpsRepo.allocateSeqNumber).not.toHaveBeenCalled();
    });

    it('hpDelta na PC/NPC token → 400 (HP PC/NPC žije v deníku postavy)', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [makeToken('t1', 'pj')] }), // PC: bez templateId/bestie:
      );
      await expect(
        service.apply(
          'scene1',
          { type: 'token.update', tokenId: 't1', patch: {}, hpDelta: -2 },
          pj,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockMapsRepo.atomicUpdateAndFetch).not.toHaveBeenCalled();
    });

    it('hpDelta: token zmizel mezi load a update (fetch → null) → 404, seq se nealokuje', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [bestieToken()] }),
      );
      mockMapsRepo.atomicUpdateAndFetch.mockResolvedValue(null);
      await expect(
        service.apply(
          'scene1',
          { type: 'token.update', tokenId: 'b1', patch: {}, hpDelta: -2 },
          pj,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockOpsRepo.allocateSeqNumber).not.toHaveBeenCalled();
    });

    it('hpDelta na bestii NEvolá diary sync (bestie = nezávislá instance)', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [bestieToken()] }),
      );
      mockMapsRepo.atomicUpdateAndFetch.mockResolvedValue(
        makeScene({ tokens: [{ ...bestieToken(), currentHp: 8 }] }),
      );
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        system: 'dnd5e',
      });

      await service.apply(
        'scene1',
        { type: 'token.update', tokenId: 'b1', patch: {}, hpDelta: -2 },
        pj,
      );

      expect(mockCharactersRepo.findBySlugAndWorld).not.toHaveBeenCalled();
      expect(mockDiaryRepo.updateWithCustomDataPatch).not.toHaveBeenCalled();
    });

    it('hpDelta jako string → 400 na DTO validaci (CH-122: žádná tichá koerce)', async () => {
      mockMapsRepo.findById.mockResolvedValue(
        makeScene({ tokens: [bestieToken()] }),
      );
      await expect(
        service.apply(
          'scene1',
          { type: 'token.update', tokenId: 'b1', patch: {}, hpDelta: '-2' },
          pj,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockMapsRepo.atomicUpdateAndFetch).not.toHaveBeenCalled();
    });
  });

  // D-DROBNE-UNDO — POST /maps/:id/operations/undo (undoLast)
  describe('undoLast', () => {
    const undoableRecord = (
      overrides: Partial<{
        id: string;
        op: Record<string, unknown>;
        inverse: Record<string, unknown> | null;
      }> = {},
    ) => ({
      id: 'op1',
      sceneId: 'scene1',
      worldId: 'world1',
      seqNumber: 7,
      op: { type: 'token.update', tokenId: 't1', patch: { currentHp: 3 } },
      inverse: {
        type: 'token.update',
        tokenId: 't1',
        patch: { currentHp: 10 },
      },
      byUserId: 'pj',
      byUserRole: UserRole.Hrac,
      appliedAt: new Date(),
      undone: false,
      ...overrides,
    });

    it('vrátí token.update — aplikuje inverse (HP zpět) standardní pipeline + flagne původní op', async () => {
      const scene = makeScene({
        tokens: [{ ...makeToken('t1', 'pj'), currentHp: 3 }],
      });
      mockMapsRepo.findById.mockResolvedValue(scene);
      mockOpsRepo.findLastUndoableByUser.mockResolvedValue(undoableRecord());

      const result = await service.undoLast('scene1', pj);

      // Gate + lookup
      expect(mockAuthorizer.assertCanUndo).toHaveBeenCalledWith(pj, scene);
      expect(mockOpsRepo.findLastUndoableByUser).toHaveBeenCalledWith(
        'scene1',
        'pj',
      );
      // Standardní pipeline: authorizer inverse op + atomic update HP zpět na 10
      expect(mockAuthorizer.assertCanDo).toHaveBeenCalled();
      expect(mockMapsRepo.atomicUpdate).toHaveBeenCalledWith(
        { _id: 'scene1', 'tokens.id': 't1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            'tokens.$.currentHp': 10,
          }) as Record<string, unknown>,
        }),
      );
      // Log + broadcast jako běžná op
      expect(mockOpsRepo.appendOperation).toHaveBeenCalled();
      expect(mockGateway.emitMapOperation).toHaveBeenCalled();
      // Flag: původní op + undo záznam (žádné redo)
      expect(mockOpsRepo.markUndone).toHaveBeenCalledWith('op1');
      expect(mockOpsRepo.markUndone).toHaveBeenCalledWith('rec1');
      expect(result.op).toMatchObject({
        type: 'token.update',
        tokenId: 't1',
      });
    });

    it('undo scene.deactivate → aplikuje scene.activate (CAS aktivuje zpět)', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene({ isActive: false }));
      mockOpsRepo.findLastUndoableByUser.mockResolvedValue(
        undoableRecord({
          op: { type: 'scene.deactivate' },
          inverse: { type: 'scene.activate' },
        }),
      );

      const result = await service.undoLast('scene1', pj);

      expect(mockMapsRepo.atomicUpdate).toHaveBeenLastCalledWith(
        { _id: 'scene1', isActive: false },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: true }) as unknown,
        }),
      );
      expect(result.applied).not.toBe(false);
      expect(mockOpsRepo.markUndone).toHaveBeenCalledWith('op1');
    });

    it('nic k vrácení → 404 NOTHING_TO_UNDO (friendly), žádná mutace', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene());
      mockOpsRepo.findLastUndoableByUser.mockResolvedValue(null);

      const promise = service.undoLast('scene1', pj);
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'NOTHING_TO_UNDO' },
      });
      expect(mockMapsRepo.atomicUpdate).not.toHaveBeenCalled();
      expect(mockOpsRepo.markUndone).not.toHaveBeenCalled();
    });

    it('hráč (ne-PJ) → 403 z assertCanUndo, ani lookup logu', async () => {
      mockMapsRepo.findById.mockResolvedValue(makeScene());
      mockAuthorizer.assertCanUndo.mockRejectedValueOnce(
        new ForbiddenException({
          code: 'MAP_OP_FORBIDDEN',
          message: 'Vrácení operace je dostupné jen PJ / Pomocnému PJ',
        }),
      );

      await expect(
        service.undoLast('scene1', { id: 'player1', role: UserRole.Hrac }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockOpsRepo.findLastUndoableByUser).not.toHaveBeenCalled();
      expect(mockMapsRepo.atomicUpdate).not.toHaveBeenCalled();
    });

    it('neexistující scéna → 404 MAP_SCENE_NOT_FOUND', async () => {
      mockMapsRepo.findById.mockResolvedValue(null);
      await expect(service.undoLast('missing', pj)).rejects.toMatchObject({
        response: { code: 'MAP_SCENE_NOT_FOUND' },
      });
    });

    it('dvojité undo nevrací tutéž op dvakrát — postupuje stackem dál', async () => {
      const scene = makeScene({
        isActive: false,
        tokens: [{ ...makeToken('t1', 'pj'), currentHp: 3 }],
      });
      mockMapsRepo.findById.mockResolvedValue(scene);
      // 1. undo → poslední undoable je op1 (token.update)
      mockOpsRepo.findLastUndoableByUser.mockResolvedValueOnce(
        undoableRecord(),
      );
      // 2. undo → op1 už je flagnutá `undone`, repo vrací starší op0
      mockOpsRepo.findLastUndoableByUser.mockResolvedValueOnce(
        undoableRecord({
          id: 'op0',
          op: { type: 'scene.deactivate' },
          inverse: { type: 'scene.activate' },
        }),
      );

      const first = await service.undoLast('scene1', pj);
      expect(first.op).toMatchObject({ type: 'token.update' });
      expect(mockOpsRepo.markUndone).toHaveBeenCalledWith('op1');

      const second = await service.undoLast('scene1', pj);
      expect(second.op).toMatchObject({ type: 'scene.activate' });
      expect(mockOpsRepo.markUndone).toHaveBeenCalledWith('op0');
      // op1 se podruhé NEaplikovala — druhá aplikace byla scene.activate
      expect(mockMapsRepo.atomicUpdate).toHaveBeenLastCalledWith(
        { _id: 'scene1', isActive: false },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: true }) as unknown,
        }),
      );
    });
  });
});
