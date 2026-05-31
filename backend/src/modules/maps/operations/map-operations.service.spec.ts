import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
    findLastByUser: jest.fn(),
  };
  const mockGateway = {
    emitMapOperation: jest.fn(),
    // 10.2c-edit-1 — scene.deactivate cascade emits world:operation + reassigned
    emitWorldOperation: jest.fn(),
    emitReassigned: jest.fn(),
    emitMemberJoined: jest.fn(),
  };
  const mockAuthorizer = {
    assertCanDo: jest.fn().mockResolvedValue(undefined),
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

    mockMembershipRepo.findByWorldId.mockResolvedValue([]);
    mockMembershipRepo.setCurrentScene.mockResolvedValue(null);
    mockWorldOpsRepo.allocateSeqNumber.mockResolvedValue(1);
    mockWorldOpsRepo.appendOperation.mockImplementation((record) =>
      Promise.resolve({ id: 'wrec1', ...record }),
    );

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
});
