import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperationsAuthorizer } from './operations-authorizer.service';
import { UserRole } from '../../users/interfaces/user.interface';
import { WorldRole } from '../../worlds/interfaces/world-membership.interface';
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
  activeCharacterIds: [],
  activeBestieIds: [],
  ...overrides,
});

const makeToken = (characterId: string, id = 't1') => ({
  id,
  characterId,
  characterSlug: 'abc',
  q: 0,
  r: 0,
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

const sa = { id: 'sa', role: UserRole.Superadmin };
const admin = { id: 'admin', role: UserRole.Admin };
const player = { id: 'player1', role: UserRole.Hrac };
const otherPlayer = { id: 'player2', role: UserRole.Hrac };

describe('OperationsAuthorizer', () => {
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };
  const authorizer = new OperationsAuthorizer(mockMembershipRepo as never);

  beforeEach(() => jest.clearAllMocks());

  describe('assertCanDo — Sa/Admin bypass', () => {
    it('Sa projde libovolnou operaci bez membership lookupu', async () => {
      await expect(
        authorizer.assertCanDo(sa, makeScene(), {
          type: 'effect.add',
          effect: { id: 'e1', type: 'color' } as never,
        } as never),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('Admin projde', async () => {
      await expect(
        authorizer.assertCanDo(admin, makeScene(), {
          type: 'fog.set',
          enabled: true,
          revealedHexes: [],
        } as never),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertCanDo — PJ membership bypass', () => {
    it('PJ světa projde libovolnou per-scene operaci', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'effect.add',
          effect: { id: 'e1', type: 'color' } as never,
        } as never),
      ).resolves.toBeUndefined();
    });

    it('PomocnyPJ projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'fog.brush',
          mode: 'reveal',
          hexes: [],
        } as never),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertCanDo — non-member', () => {
    it('cizí user → MAP_OP_FORBIDDEN', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'token.move',
          tokenId: 't1',
          q: 0,
          r: 0,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertCanDo — hráč per op typ', () => {
    beforeEach(() => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
    });

    it('token.move vlastního tokenu → OK', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [makeToken(player.id)] }),
          { type: 'token.move', tokenId: 't1', q: 5, r: -2 } as never,
        ),
      ).resolves.toBeUndefined();
    });

    it('token.move cizího tokenu → FORBIDDEN', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [makeToken(otherPlayer.id)] }),
          { type: 'token.move', tokenId: 't1', q: 5, r: -2 } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('token.move neexistujícího tokenu → NOT_FOUND', async () => {
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'token.move',
          tokenId: 'xxx',
          q: 0,
          r: 0,
        } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('token.move vlastní token, ale scene.isLocked → FORBIDDEN', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({
            tokens: [makeToken(player.id)],
            isLocked: true,
          }),
          { type: 'token.move', tokenId: 't1', q: 5, r: -2 } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    // 10.2n — efektivní per-hráč lock
    it('token.move: per-hráč lock override (scéna odemčená) → FORBIDDEN', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({
            tokens: [makeToken(player.id)],
            isLocked: false,
            playerStates: [{ userId: player.id, isLocked: true }],
          }),
          { type: 'token.move', tokenId: 't1', q: 5, r: -2 } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('token.move: per-hráč override false přebije zamčenou scénu → OK', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({
            tokens: [makeToken(player.id)],
            isLocked: true,
            playerStates: [{ userId: player.id, isLocked: false }],
          }),
          { type: 'token.move', tokenId: 't1', q: 5, r: -2 } as never,
        ),
      ).resolves.toBeUndefined();
    });

    it('token.move: override jiného hráče tohoto neovlivní → OK', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({
            tokens: [makeToken(player.id)],
            isLocked: false,
            playerStates: [{ userId: otherPlayer.id, isLocked: true }],
          }),
          { type: 'token.move', tokenId: 't1', q: 5, r: -2 } as never,
        ),
      ).resolves.toBeUndefined();
    });

    it('token.update s povoleným patch (currentHp) → OK', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [makeToken(player.id)] }),
          {
            type: 'token.update',
            tokenId: 't1',
            patch: { currentHp: 3 },
          } as never,
        ),
      ).resolves.toBeUndefined();
    });

    it('token.update s injury → OK', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [makeToken(player.id)] }),
          {
            type: 'token.update',
            tokenId: 't1',
            patch: { injury: 2 },
          } as never,
        ),
      ).resolves.toBeUndefined();
    });

    it('token.update zamčeného tokenu (isLocked) → FORBIDDEN (N-29)', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [{ ...makeToken(player.id), isLocked: true }] }),
          {
            type: 'token.update',
            tokenId: 't1',
            patch: { currentHp: 3 },
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('token.update s armor → FORBIDDEN (mimo allowed fields)', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [makeToken(player.id)] }),
          {
            type: 'token.update',
            tokenId: 't1',
            patch: { armor: 5 },
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('token.update s isLocked → FORBIDDEN (D-066 per-token lock je PJ-only)', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [makeToken(player.id)] }),
          {
            type: 'token.update',
            tokenId: 't1',
            patch: { isLocked: true },
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('effect.add → FORBIDDEN (PJ-only)', async () => {
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'effect.add',
          effect: { id: 'e1', type: 'color' } as never,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('fog.brush → FORBIDDEN (PJ-only)', async () => {
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'fog.brush',
          mode: 'reveal',
          hexes: [{ q: 0, r: 0 }],
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('scene.state → FORBIDDEN (PJ-only)', async () => {
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'scene.state',
          isHidden: true,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    // 10.2j — dice.roll autorizace
    it('dice.roll s vlastním byUserId (bez tokenId) → OK', async () => {
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'dice.roll',
          roll: {
            id: 'r1',
            rolledAt: new Date().toISOString(),
            byUserId: player.id,
            rollerName: 'Hráč',
            rollerKind: 'pc',
            category: 'custom',
            dicePayload: {},
          },
        } as never),
      ).resolves.toBeUndefined();
    });

    it('dice.roll s cizím byUserId → FORBIDDEN (anti-spoof)', async () => {
      await expect(
        authorizer.assertCanDo(player, makeScene(), {
          type: 'dice.roll',
          roll: {
            id: 'r2',
            rolledAt: new Date().toISOString(),
            byUserId: otherPlayer.id,
            rollerName: 'Jiný',
            rollerKind: 'pc',
            category: 'custom',
            dicePayload: {},
          },
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('dice.roll za vlastní PC token → OK', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [makeToken(player.id, 't1')] }),
          {
            type: 'dice.roll',
            roll: {
              id: 'r3',
              rolledAt: new Date().toISOString(),
              byUserId: player.id,
              rollerName: 'Hráč',
              rollerKind: 'pc',
              category: 'skill',
              tokenId: 't1',
              dicePayload: {},
            },
          } as never,
        ),
      ).resolves.toBeUndefined();
    });

    it('dice.roll za cizí token → FORBIDDEN', async () => {
      await expect(
        authorizer.assertCanDo(
          player,
          makeScene({ tokens: [makeToken(otherPlayer.id, 't1')] }),
          {
            type: 'dice.roll',
            roll: {
              id: 'r4',
              rolledAt: new Date().toISOString(),
              byUserId: player.id,
              rollerName: 'Hráč',
              rollerKind: 'pc',
              category: 'skill',
              tokenId: 't1',
              dicePayload: {},
            },
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertCanDoWorldOp', () => {
    it('PJ smí libovolnou cross-scene op', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        authorizer.assertCanDoWorldOp(player, 'world1', {
          type: 'member.assignToScene',
          userId: 'u2',
          sceneId: 's1',
        } as never),
      ).resolves.toBeUndefined();
    });

    it('Hráč může self-unassign', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        authorizer.assertCanDoWorldOp(player, 'world1', {
          type: 'member.unassign',
          userId: player.id,
        } as never),
      ).resolves.toBeUndefined();
    });

    it('Hráč NEsmí unassignout cizího', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        authorizer.assertCanDoWorldOp(player, 'world1', {
          type: 'member.unassign',
          userId: 'u2',
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Hráč NEsmí self-assign na cizí scénu', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        authorizer.assertCanDoWorldOp(player, 'world1', {
          type: 'member.assignToScene',
          userId: player.id,
          sceneId: 's1',
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Non-member → FORBIDDEN', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        authorizer.assertCanDoWorldOp(player, 'world1', {
          type: 'member.unassign',
          userId: player.id,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertCanReadSceneLog', () => {
    it('PJ projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        authorizer.assertCanReadSceneLog(player, makeScene()),
      ).resolves.toBeUndefined();
    });

    it('Hráč na své scéně → OK', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
        currentSceneId: 'scene1',
      });
      await expect(
        authorizer.assertCanReadSceneLog(player, makeScene()),
      ).resolves.toBeUndefined();
    });

    it('Hráč na cizí scéně → FORBIDDEN (inter-scene privacy)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
        currentSceneId: 'sceneJiná',
      });
      await expect(
        authorizer.assertCanReadSceneLog(player, makeScene()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertCanReadWorldLog', () => {
    it('PJ projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        authorizer.assertCanReadWorldLog(player, 'world1'),
      ).resolves.toBeUndefined();
    });

    it('Hráč → FORBIDDEN', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        authorizer.assertCanReadWorldLog(player, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Sa bypass', async () => {
      await expect(
        authorizer.assertCanReadWorldLog(sa, 'world1'),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });
  });

  // 10.2c-edit-1 — read access pro samotnou scénu (`GET /maps/:id`).
  // Paralelní s assertCanReadSceneLog, ale s vlastním error code
  // MAP_FORBIDDEN_OTHER_SCENE pro UX rozlišení (klient může přesměrovat
  // na empty state) a kvůli budoucí divergenci pravidel.
  describe('assertCanReadScene', () => {
    it('Sa projde bez membership lookupu', async () => {
      await expect(
        authorizer.assertCanReadScene(sa, makeScene()),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('Admin projde bez membership lookupu', async () => {
      await expect(
        authorizer.assertCanReadScene(admin, makeScene()),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('PJ světa projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        authorizer.assertCanReadScene(player, makeScene()),
      ).resolves.toBeUndefined();
    });

    it('PomocnyPJ projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      await expect(
        authorizer.assertCanReadScene(player, makeScene()),
      ).resolves.toBeUndefined();
    });

    it('Hráč s currentSceneId === scene.id → OK', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
        currentSceneId: 'scene1',
      });
      await expect(
        authorizer.assertCanReadScene(player, makeScene()),
      ).resolves.toBeUndefined();
    });

    it('Hráč s currentSceneId === jiná scéna → 403 MAP_FORBIDDEN_OTHER_SCENE', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
        currentSceneId: 'sceneJina',
      });
      const promise = authorizer.assertCanReadScene(player, makeScene());
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'MAP_FORBIDDEN_OTHER_SCENE' },
      });
    });

    it('Hráč s currentSceneId === null → 403 MAP_FORBIDDEN_OTHER_SCENE', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
        currentSceneId: null,
      });
      const promise = authorizer.assertCanReadScene(player, makeScene());
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'MAP_FORBIDDEN_OTHER_SCENE' },
      });
    });

    it('Hráč bez membership ve světě → 403 MAP_FORBIDDEN_OTHER_SCENE', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const promise = authorizer.assertCanReadScene(player, makeScene());
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'MAP_FORBIDDEN_OTHER_SCENE' },
      });
    });

    it('Hráč na jiném tokenu (jiný user) k cizí scéně → 403', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
        currentSceneId: 'sceneA',
      });
      await expect(
        authorizer.assertCanReadScene(otherPlayer, makeScene({ id: 'sceneB' })),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
