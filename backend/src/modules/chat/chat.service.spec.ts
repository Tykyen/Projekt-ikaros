import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatService } from './chat.service';
import { ChatPresenceService } from './chat-presence.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { PushService } from '../push/push.service';
import { WorldsService } from '../worlds/worlds.service';
import { CharactersService } from '../characters/characters.service';
import { UploadService } from '../upload/upload.service';
import { WorldElevationsService } from '../world-elevations/world-elevations.service';

/** Mock WorldsService — `onApplicationBootstrap` se v `.compile()` testech nespouští. */
const mockWorldsService = {
  findAll: jest.fn().mockResolvedValue([]),
  getSettings: jest.fn().mockResolvedValue(null),
  findById: jest.fn(),
};

/** 6.8b — getGroupsWithChannels enrichuje portrét; default = prázdný adresář. */
const mockCharactersService = {
  getDirectory: jest.fn().mockResolvedValue([]),
};

/** D-040 — tombstone batch enrich; default = všichni autoři aktivní. */
const mockUsersService = {
  findManyTombstoneInfo: jest.fn().mockResolvedValue(new Map()),
  // 19.4 — enforceSupporterDiceGate (v updateMembershipAppearance) volá findById.
  // Vrací entitled uživatele (isSupporter), aby prémiové dice skiny v testech
  // persistence prošly gate; strip-path pro ne-supportera řeší supporter.util.
  findById: jest
    .fn()
    .mockResolvedValue({ id: 'user1', role: UserRole.Hrac, isSupporter: true }),
};

const mockPJ: { id: string; role: UserRole; username: string } = {
  id: 'user1',
  role: UserRole.Hrac,
  username: 'pj1',
};
const mockAdmin: {
  id: string;
  role: UserRole;
  username: string;
  elevatedWorldIds?: string[];
} = {
  id: 'admin1',
  role: UserRole.Admin,
  username: 'admin1',
  // Elevated na 'world1' — admin má chat bypass jen díky aktivní elevaci.
  elevatedWorldIds: ['world1'],
};

const mockGroup = {
  id: 'group1',
  worldId: 'world1',
  name: 'Globální',
  order: 0,
  createdAt: new Date(),
};
const mockChannel = {
  id: 'ch1',
  groupId: 'group1',
  worldId: 'world1',
  name: 'obecný',
  accessMode: 'all' as const,
  allowedRoles: [],
  allowedMemberIds: [],
  order: 0,
  isDeleted: false,
  isGlobal: false,
  type: 'all',
  createdAt: new Date(),
};
const mockPJMembership = {
  id: 'm1',
  userId: 'user1',
  worldId: 'world1',
  role: WorldRole.PJ,
  joinedAt: new Date(),
  akj: 0,
};
const mockHracMembership = {
  id: 'm2',
  userId: 'user2',
  worldId: 'world1',
  role: WorldRole.Hrac,
  joinedAt: new Date(),
  akj: 0,
};

describe('ChatService', () => {
  let service: ChatService;
  let mockPushService: { notifyUsers: jest.Mock };
  let mockEventEmitter: { emit: jest.Mock };
  const mockGroupRepo = {
    findById: jest.fn(),
    findByWorldId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    bulkUpdateOrders: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(),
    findByGroupId: jest.fn(),
    findByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    bulkUpdateOrders: jest.fn(),
    addCombatant: jest.fn(),
    updateCombatant: jest.fn(),
    removeCombatant: jest.fn(),
    setCombat: jest.fn(),
    setCombatConfig: jest.fn(),
  };
  const mockMessageRepo = {
    findById: jest.fn(),
    findByChannelId: jest.fn(),
    findByNonce: jest.fn().mockResolvedValue(null),
    countAfter: jest.fn(),
    countMentionsAfter: jest.fn(),
    searchInChannels: jest.fn(),
    findFeed: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDeleteByChannelId: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(),
    findByUserAndChannels: jest.fn(),
    upsert: jest.fn(),
    deleteByChannelId: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByCharacterPathAndWorld: jest.fn(),
    findByCharacterPathsAndWorld: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    mockPushService = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
    mockEventEmitter = { emit: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        ChatPresenceService,
        {
          provide: UploadService,
          useValue: { assertAttachmentsOrigin: jest.fn() },
        },
        { provide: CharactersService, useValue: mockCharactersService },
        { provide: WorldsService, useValue: mockWorldsService },
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        {
          provide: WorldElevationsService,
          useValue: {
            isElevated: jest.fn().mockResolvedValue(false),
            listWorldIdsForUser: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'IUsersRepository',
          useValue: {
            findByUsernames: jest.fn().mockResolvedValue([]),
            findById: jest.fn(),
          },
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PushService, useValue: mockPushService },
      ],
    }).compile();
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  describe('combat roster (16.1e)', () => {
    const channel = {
      id: 'c1',
      worldId: 'world1',
      isDeleted: false,
      accessMode: 'all',
      allowedRoles: [],
      allowedMemberIds: [],
      combatants: [
        {
          id: 'x1',
          kind: 'bestie',
          bestieId: 'b',
          name: 'Skřet',
          systemStats: { 'health.current': 3 },
          abilities: [{ name: 'Kyj', description: '5' }],
          notes: 'tajné',
          initiative: 5,
          inCombat: true,
          createdAt: new Date(),
        },
      ],
      combat: { active: false, round: 0 },
      chatCombatConfig: { showHpBestie: false },
    };
    const pjReq = { id: 'user1', role: UserRole.Hrac, username: 'pj' };
    const hracReq = { id: 'user2', role: UserRole.Hrac, username: 'hrac' };

    it('addCombatant: hráč (ne-PJ) → Forbidden, nic se nepřidá', async () => {
      mockChannelRepo.findById.mockResolvedValue(channel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.addCombatant(
          'c1',
          { kind: 'character', characterSlug: 'abi' },
          hracReq,
        ),
      ).rejects.toThrow();
      expect(mockChannelRepo.addCombatant).not.toHaveBeenCalled();
    });

    it('getCombatants: hráč u skryté bestie (showHpBestie=false) nedostane staty/poznámky', async () => {
      mockChannelRepo.findById.mockResolvedValue(channel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockWorldsService.getSettings.mockResolvedValue(null);
      const out = await service.getCombatants('c1', hracReq);
      const b = out.combatants[0] as unknown as Record<string, unknown>;
      expect(b.systemStats).toEqual({});
      expect(b.abilities).toEqual([]);
      expect(b.notes).toBe('');
      expect(out.config.showHpBestie).toBe(false);
    });

    it('getCombatants: PJ vidí plné staty bestie', async () => {
      mockChannelRepo.findById.mockResolvedValue(channel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockWorldsService.getSettings.mockResolvedValue(null);
      const out = await service.getCombatants('c1', pjReq);
      const b = out.combatants[0] as unknown as Record<string, unknown>;
      expect(b.systemStats).toEqual({ 'health.current': 3 });
      expect(b.notes).toBe('tajné');
    });
  });

  describe('syncLinkedChannelMembers (FIX-44 — revokace za provozu)', () => {
    const linkedGroup = {
      id: 'lg1',
      worldId: 'world1',
      name: 'Družina A',
      linkedWorldGroup: 'druzina-a',
      order: 0,
      createdAt: new Date(),
    };
    const linkedChannel = {
      ...mockChannel,
      id: 'linked-ch1',
      groupId: 'lg1',
      accessMode: 'members' as const,
      allowedMemberIds: ['user2'],
    };

    it('odebrání usera z allowedMemberIds emituje chat.channel.member.revoked', async () => {
      mockGroupRepo.findByWorldId.mockResolvedValue([linkedGroup]);
      mockChannelRepo.findByGroupId.mockResolvedValue([linkedChannel]);
      // Uživatel není staff a už není v „druzina-a" → measure removal.
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockHracMembership,
        userId: 'user2',
      });
      await service.handleMembershipRemovedSync({
        worldId: 'world1',
        userId: 'user2',
        membershipId: 'm2',
      });
      expect(mockChannelRepo.update).toHaveBeenCalledWith('linked-ch1', {
        allowedMemberIds: [],
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'chat.channel.member.revoked',
        { channelId: 'linked-ch1', userId: 'user2' },
      );
    });

    it('přidání usera do allowedMemberIds neemituje revoked event', async () => {
      const emptyChannel = { ...linkedChannel, allowedMemberIds: [] };
      mockGroupRepo.findByWorldId.mockResolvedValue([linkedGroup]);
      mockChannelRepo.findByGroupId.mockResolvedValue([emptyChannel]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockHracMembership,
        userId: 'user2',
        group: 'druzina-a',
      });
      await service.handleMembershipChangedSync({
        worldId: 'world1',
        membership: {
          ...mockHracMembership,
          userId: 'user2',
          group: 'druzina-a',
        },
      });
      expect(mockChannelRepo.update).toHaveBeenCalledWith('linked-ch1', {
        allowedMemberIds: ['user2'],
      });
      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        'chat.channel.member.revoked',
        expect.anything(),
      );
    });
  });

  describe('getFeed (13.2a — souhrn chatů cross-world)', () => {
    const baseMsg = {
      id: 'm',
      channelId: 'ch1',
      worldId: 'world1',
      senderId: 'user9',
      senderName: 'X',
      content: 'ahoj',
      reactions: {},
      mentions: [],
      isEdited: false,
      isDeleted: false,
      customFont: null,
      customFontSize: null,
      color: null,
      isDiceRoll: false,
      dicePayload: null,
      diceSkin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const rolesChannel = {
      ...mockChannel,
      id: 'ch-roles',
      name: 'PJ kanál',
      accessMode: 'roles' as const,
      allowedRoles: [WorldRole.PomocnyPJ, WorldRole.PJ],
    };

    it('hráč: kanál world1 jde do memberChannelIds (ne manager — nevidí cizí whispery)', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { ...mockHracMembership, userId: 'user2', worldId: 'world1' },
      ]);
      mockChannelRepo.findByWorldId.mockResolvedValue([mockChannel]);
      mockWorldsService.findById.mockResolvedValue({
        id: 'world1',
        name: 'Svět 1',
        slug: 'svet-1',
      });
      mockMessageRepo.findFeed.mockResolvedValue([
        { ...baseMsg, id: 'msg1', channelId: 'ch1', worldId: 'world1' },
      ]);

      const res = await service.getFeed(
        { id: 'user2', role: UserRole.Hrac, username: 'user2' },
        {},
      );

      const arg = mockMessageRepo.findFeed.mock.calls[0][0];
      expect(arg.memberChannelIds).toContain('ch1');
      expect(arg.managerChannelIds).toEqual([]);
      expect(res[0]).toMatchObject({
        channelName: 'obecný',
        worldName: 'Svět 1',
        worldSlug: 'svet-1',
        worldId: 'world1',
      });
    });

    it('PJ: kanály světa jdou do managerChannelIds (vidí všechny whispery)', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([mockPJMembership]);
      mockChannelRepo.findByWorldId.mockResolvedValue([
        mockChannel,
        rolesChannel,
      ]);
      mockWorldsService.findById.mockResolvedValue({
        id: 'world1',
        name: 'S1',
      });
      mockMessageRepo.findFeed.mockResolvedValue([]);

      await service.getFeed(mockPJ, {});

      const arg = mockMessageRepo.findFeed.mock.calls[0][0];
      expect(arg.managerChannelIds).toEqual(
        expect.arrayContaining(['ch1', 'ch-roles']),
      );
      expect(arg.memberChannelIds).toEqual([]);
    });

    it('hráč nezahrne role-restricted kanál, kam nemá přístup (žádný leak)', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { ...mockHracMembership, userId: 'user2', worldId: 'world1' },
      ]);
      mockChannelRepo.findByWorldId.mockResolvedValue([
        mockChannel,
        rolesChannel,
      ]);
      mockWorldsService.findById.mockResolvedValue({
        id: 'world1',
        name: 'S1',
      });
      mockMessageRepo.findFeed.mockResolvedValue([]);

      await service.getFeed(
        { id: 'user2', role: UserRole.Hrac, username: 'user2' },
        {},
      );

      const arg = mockMessageRepo.findFeed.mock.calls[0][0];
      expect(arg.memberChannelIds).toEqual(['ch1']);
      expect(arg.memberChannelIds).not.toContain('ch-roles');
      expect(arg.managerChannelIds).toEqual([]);
    });

    it('žadatel nezahrne žádný kanál svého světa', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        {
          ...mockHracMembership,
          userId: 'u3',
          worldId: 'world1',
          role: WorldRole.Zadatel,
        },
      ]);
      mockChannelRepo.findByWorldId.mockResolvedValue([mockChannel]);
      mockMessageRepo.findFeed.mockResolvedValue([]);

      await service.getFeed(
        { id: 'u3', role: UserRole.Hrac, username: 'u3' },
        {},
      );

      const arg = mockMessageRepo.findFeed.mock.calls[0][0];
      expect(arg.managerChannelIds).toEqual([]);
      expect(arg.memberChannelIds).toEqual([]);
      expect(mockChannelRepo.findByWorldId).not.toHaveBeenCalled();
    });

    it('limit je ořezán na max 100', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([]);
      mockMessageRepo.findFeed.mockResolvedValue([]);
      await service.getFeed(mockPJ, { limit: 500 });
      expect(mockMessageRepo.findFeed.mock.calls[0][0].limit).toBe(100);
    });
  });

  describe('createGroup', () => {
    it('should allow PJ to create group', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.countByWorldId.mockResolvedValue(2);
      mockGroupRepo.save.mockResolvedValue({ ...mockGroup, name: 'Nová' });
      const result = await service.createGroup(
        'world1',
        { name: 'Nová' },
        mockPJ,
      );
      expect(result.name).toBe('Nová');
    });

    it('should throw ForbiddenException for Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.createGroup(
          'world1',
          { name: 'X' },
          { id: 'user2', role: UserRole.Hrac, username: 'user2' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Admin regardless of membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockGroupRepo.countByWorldId.mockResolvedValue(0);
      mockGroupRepo.save.mockResolvedValue(mockGroup);
      const result = await service.createGroup(
        'world1',
        { name: 'G' },
        mockAdmin,
      );
      expect(result).toBeDefined();
    });

    it('propaguje imageUrl do uloženého kanálu', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.countByWorldId.mockResolvedValue(0);
      mockGroupRepo.save.mockImplementation((data) =>
        Promise.resolve({ ...mockGroup, ...data }),
      );
      await service.createGroup(
        'world1',
        { name: 'S obrázkem', imageUrl: 'https://img/x.png' },
        mockPJ,
      );
      const saved = mockGroupRepo.save.mock.calls[0][0];
      expect(saved.imageUrl).toBe('https://img/x.png');
    });
  });

  // ─── Krok 6.5a — reorderGroups ───────────────────────────────────────────

  describe('reorderGroups', () => {
    const g1 = { ...mockGroup, id: 'g1', order: 0 };
    const g2 = { ...mockGroup, id: 'g2', order: 1 };
    const g3 = { ...mockGroup, id: 'g3', order: 2 };

    it('PJ může přerovnat kanály — volá bulkUpdateOrders s daným pořadím', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.findByWorldId.mockResolvedValue([g1, g2, g3]);
      const items = [
        { id: 'g3', order: 0 },
        { id: 'g1', order: 1 },
        { id: 'g2', order: 2 },
      ];
      await service.reorderGroups('world1', items, mockPJ);
      expect(mockGroupRepo.bulkUpdateOrders).toHaveBeenCalledWith(items);
    });

    it('Hráč dostane ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.reorderGroups('world1', [{ id: 'g1', order: 0 }], {
          id: 'user2',
          role: UserRole.Hrac,
          username: 'user2',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('odmítne ID, které nepatří do světa (INVALID_GROUP_ID)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.findByWorldId.mockResolvedValue([g1, g2]);
      await expect(
        service.reorderGroups(
          'world1',
          [
            { id: 'g1', order: 0 },
            { id: 'cizi', order: 1 },
          ],
          mockPJ,
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_GROUP_ID' } });
    });

    it('prázdné items = no-op (neemituje, nevolá repo)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      await service.reorderGroups('world1', [], mockPJ);
      expect(mockGroupRepo.bulkUpdateOrders).not.toHaveBeenCalled();
    });
  });

  // ─── Krok 6.5b — reorderChannels ─────────────────────────────────────────

  describe('reorderChannels', () => {
    const c1 = { ...mockChannel, id: 'c1', groupId: 'g1', order: 0 };
    const c2 = { ...mockChannel, id: 'c2', groupId: 'g1', order: 1 };
    const c3 = { ...mockChannel, id: 'c3', groupId: 'g2', order: 0 };

    it('PJ může přerovnat konverzace v rámci jednoho kanálu', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByWorldId.mockResolvedValue([c1, c2]);
      const items = [
        { id: 'c2', order: 0 },
        { id: 'c1', order: 1 },
      ];
      await service.reorderChannels('world1', items, mockPJ);
      expect(mockChannelRepo.bulkUpdateOrders).toHaveBeenCalledWith(items);
    });

    it('odmítne reorder napříč kanály (MIXED_GROUPS)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByWorldId.mockResolvedValue([c1, c2, c3]);
      await expect(
        service.reorderChannels(
          'world1',
          [
            { id: 'c1', order: 0 },
            { id: 'c3', order: 1 },
          ],
          mockPJ,
        ),
      ).rejects.toMatchObject({ response: { code: 'MIXED_GROUPS' } });
    });

    it('odmítne neznámý channelId (INVALID_CHANNEL_ID)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByWorldId.mockResolvedValue([c1, c2]);
      await expect(
        service.reorderChannels('world1', [{ id: 'cizi', order: 0 }], mockPJ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CHANNEL_ID' } });
    });

    it('Pomocný PJ smí (sjednoceno s edit/delete)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockPJMembership,
        role: WorldRole.PomocnyPJ,
      });
      mockChannelRepo.findByWorldId.mockResolvedValue([c1, c2]);
      await service.reorderChannels(
        'world1',
        [
          { id: 'c2', order: 0 },
          { id: 'c1', order: 1 },
        ],
        { id: 'pomocny', role: UserRole.Hrac, username: 'pomocny' },
      );
      expect(mockChannelRepo.bulkUpdateOrders).toHaveBeenCalled();
    });
  });

  // ─── Krok 6.5c — updateGroup color/iconKey ───────────────────────────────

  describe('updateGroup s color/iconKey', () => {
    it('propaguje color do update DTO', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.findById.mockResolvedValue(mockGroup);
      mockGroupRepo.update.mockImplementation((id, data) =>
        Promise.resolve({ ...mockGroup, ...data }),
      );
      const result = await service.updateGroup(
        mockGroup.id,
        { color: '5' },
        mockPJ,
      );
      expect(result.color).toBe('5');
      const arg = mockGroupRepo.update.mock.calls[0][1];
      expect(arg.color).toBe('5');
    });

    it('propaguje iconKey do update DTO', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.findById.mockResolvedValue(mockGroup);
      mockGroupRepo.update.mockImplementation((id, data) =>
        Promise.resolve({ ...mockGroup, ...data }),
      );
      const result = await service.updateGroup(
        mockGroup.id,
        { iconKey: 'crown' },
        mockPJ,
      );
      expect(result.iconKey).toBe('crown');
    });
  });

  describe('getGroupsWithChannels', () => {
    const publicCh = { ...mockChannel, id: 'pub', accessMode: 'all' as const };
    const privateCh = {
      ...mockChannel,
      id: 'priv',
      accessMode: 'members' as const,
      allowedMemberIds: ['someoneElse'],
    };

    it('Hráč nevidí cizí members konverzaci', async () => {
      mockGroupRepo.findByWorldId.mockResolvedValue([mockGroup]);
      mockChannelRepo.findByWorldId.mockResolvedValue([publicCh, privateCh]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      const result = await service.getGroupsWithChannels('world1', {
        id: 'user2',
        role: UserRole.Hrac,
        username: 'user2',
      });
      const ids = result[0].channels.map((c) => c.id);
      expect(ids).toContain('pub');
      expect(ids).not.toContain('priv');
    });

    it('Čtenář nevidí all konverzaci (role floor Hráč)', async () => {
      mockGroupRepo.findByWorldId.mockResolvedValue([mockGroup]);
      mockChannelRepo.findByWorldId.mockResolvedValue([publicCh]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockHracMembership,
        role: WorldRole.Ctenar,
      });
      const result = await service.getGroupsWithChannels('world1', {
        id: 'user2',
        role: UserRole.Hrac,
        username: 'user2',
      });
      expect(result[0].channels).toHaveLength(0);
    });

    it('PomocnyPJ vidí všechny konverzace včetně cizích 1:1', async () => {
      mockGroupRepo.findByWorldId.mockResolvedValue([mockGroup]);
      mockChannelRepo.findByWorldId.mockResolvedValue([publicCh, privateCh]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockPJMembership,
        role: WorldRole.PomocnyPJ,
      });
      const result = await service.getGroupsWithChannels('world1', {
        id: 'pomPj',
        role: UserRole.Hrac,
        username: 'pomPj',
      });
      expect(result[0].channels).toHaveLength(2);
    });
  });

  describe('getChannelPresence', () => {
    it('vrátí seznam přítomných když má uživatel přístup', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      const result = await service.getChannelPresence('ch1', 'user2');
      expect(Array.isArray(result)).toBe(true);
    });

    it('403 když uživatel nemá přístup', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.getChannelPresence('ch1', 'stranger'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createChannel', () => {
    it('uloží volný řetězec type (např. kuchyne)', async () => {
      mockGroupRepo.findById.mockResolvedValue(mockGroup);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByGroupId.mockResolvedValue([]);
      mockChannelRepo.save.mockImplementation((data) =>
        Promise.resolve({
          ...mockChannel,
          ...data,
        }),
      );
      await service.createChannel(
        'group1',
        { name: 'kuchyne-chat', type: 'kuchyne' },
        mockPJ,
      );
      const savedArg = mockChannelRepo.save.mock.calls[0][0];
      expect(savedArg.type).toBe('kuchyne');
    });

    it('propaguje imageUrl konverzace do save', async () => {
      mockGroupRepo.findById.mockResolvedValue(mockGroup);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByGroupId.mockResolvedValue([]);
      mockChannelRepo.save.mockImplementation((data) =>
        Promise.resolve({ ...mockChannel, ...data }),
      );
      await service.createChannel(
        'group1',
        { name: 's obrázkem', imageUrl: 'https://img/c.png' },
        mockPJ,
      );
      const saved = mockChannelRepo.save.mock.calls[0][0];
      expect(saved.imageUrl).toBe('https://img/c.png');
    });

    it("bez type použije default 'all'", async () => {
      mockGroupRepo.findById.mockResolvedValue(mockGroup);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByGroupId.mockResolvedValue([]);
      mockChannelRepo.save.mockImplementation((data) =>
        Promise.resolve({
          ...mockChannel,
          ...data,
        }),
      );
      await service.createChannel('group1', { name: 'novy' }, mockPJ);
      const savedArg = mockChannelRepo.save.mock.calls[0][0];
      expect(savedArg.type).toBe('all');
    });
  });

  describe('deleteGroup', () => {
    it('should delete group and its channels', async () => {
      mockGroupRepo.findById.mockResolvedValue(mockGroup);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByGroupId.mockResolvedValue([mockChannel]);
      mockChannelRepo.delete.mockResolvedValue(true);
      mockGroupRepo.delete.mockResolvedValue(true);
      await service.deleteGroup('group1', mockPJ);
      expect(mockChannelRepo.delete).toHaveBeenCalledWith('ch1');
      expect(mockGroupRepo.delete).toHaveBeenCalledWith('group1');
    });

    it('should throw NotFoundException for unknown group', async () => {
      mockGroupRepo.findById.mockResolvedValue(null);
      await expect(service.deleteGroup('unknown', mockPJ)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('hasChannelAccess', () => {
    it('returns true for accessMode=all when member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      const result = await service.hasChannelAccess(mockChannel, 'user2');
      expect(result).toBe(true);
    });

    it('returns false for accessMode=all when not member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.hasChannelAccess(mockChannel, 'stranger');
      expect(result).toBe(false);
    });

    it('returns false for accessMode=all when Pending', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockHracMembership,
        role: WorldRole.Zadatel,
      });
      const result = await service.hasChannelAccess(mockChannel, 'user2');
      expect(result).toBe(false);
    });

    it('returns false for accessMode=all when Ctenar (under Hráč floor)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockHracMembership,
        role: WorldRole.Ctenar,
      });
      const result = await service.hasChannelAccess(mockChannel, 'user2');
      expect(result).toBe(false);
    });

    it('returns true for accessMode=roles when role matches', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      const roleChannel = {
        ...mockChannel,
        accessMode: 'roles' as const,
        allowedRoles: [WorldRole.PJ],
      };
      const result = await service.hasChannelAccess(roleChannel, 'user1');
      expect(result).toBe(true);
    });

    it('returns true for accessMode=members when userId in list', async () => {
      const membersChannel = {
        ...mockChannel,
        accessMode: 'members' as const,
        allowedMemberIds: ['user2'],
      };
      const result = await service.hasChannelAccess(membersChannel, 'user2');
      expect(result).toBe(true);
    });

    it('6.7a — members: PJ (manager) mimo allowedMemberIds má přístup (bypass)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      const membersChannel = {
        ...mockChannel,
        accessMode: 'members' as const,
        allowedMemberIds: [],
      };
      const result = await service.hasChannelAccess(membersChannel, 'user1');
      expect(result).toBe(true);
    });

    it('6.7a — members: cizí ne-manager nemá přístup', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      (service['usersRepo'].findById as jest.Mock).mockResolvedValue({
        id: 'stranger',
        role: UserRole.Hrac,
        username: 'stranger',
      });
      const membersChannel = {
        ...mockChannel,
        accessMode: 'members' as const,
        allowedMemberIds: [],
      };
      const result = await service.hasChannelAccess(membersChannel, 'stranger');
      expect(result).toBe(false);
    });
  });

  describe('6.7a — auto-konverzace postavy', () => {
    const postavyGroup = { ...mockGroup, id: 'gp', name: 'Postavy', order: 1 };

    it('character.created (PC s vlastníkem) → soukromá konverzace v Postavy', async () => {
      mockGroupRepo.findByWorldId.mockResolvedValue([mockGroup, postavyGroup]);
      mockChannelRepo.findByGroupId.mockResolvedValue([]);
      mockChannelRepo.save.mockResolvedValue({ ...mockChannel, id: 'chc' });
      await service.handleCharacterCreatedChat({
        worldId: 'world1',
        userId: 'user2',
        isNpc: false,
        name: 'Aragorn',
      });
      expect(mockChannelRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'gp',
          name: 'Aragorn',
          accessMode: 'members',
          allowedMemberIds: ['user2'],
          type: 'character',
          linkedMemberUserId: 'user2',
        }),
      );
    });

    it('NPC nebo bez userId → nic nevytvoří', async () => {
      await service.handleCharacterCreatedChat({
        worldId: 'world1',
        userId: 'user2',
        isNpc: true,
        name: 'Skřet',
      });
      await service.handleCharacterCreatedChat({
        worldId: 'world1',
        userId: undefined,
        isNpc: false,
        name: 'Bezejmenný',
      });
      expect(mockChannelRepo.save).not.toHaveBeenCalled();
    });

    it('idempotence: existující se nevytváří znovu, jen přejmenuje', async () => {
      const existing = {
        ...mockChannel,
        id: 'chc',
        groupId: 'gp',
        name: 'Aragorn',
        accessMode: 'members' as const,
        allowedMemberIds: ['user2'],
        type: 'character',
        linkedMemberUserId: 'user2',
      };
      mockGroupRepo.findByWorldId.mockResolvedValue([mockGroup, postavyGroup]);
      mockChannelRepo.findByGroupId.mockResolvedValue([existing]);
      mockChannelRepo.update.mockResolvedValue({
        ...existing,
        name: 'Gandalf',
      });
      await service.handleCharacterUpdatedChat({
        worldId: 'world1',
        userId: 'user2',
        isNpc: false,
        name: 'Gandalf',
      });
      expect(mockChannelRepo.save).not.toHaveBeenCalled();
      expect(mockChannelRepo.update).toHaveBeenCalledWith('chc', {
        name: 'Gandalf',
      });
    });

    it('world.character.assigned (bez jména) → název = username hráče', async () => {
      mockGroupRepo.findByWorldId.mockResolvedValue([mockGroup, postavyGroup]);
      mockChannelRepo.findByGroupId.mockResolvedValue([]);
      (service['usersRepo'].findById as jest.Mock).mockResolvedValue({
        id: 'user2',
        role: UserRole.Hrac,
        username: 'FOksiGen',
      });
      mockChannelRepo.save.mockResolvedValue({ ...mockChannel, id: 'chc' });
      await service.handleCharacterAssignedChat({
        worldId: 'world1',
        userId: 'user2',
      });
      expect(mockChannelRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'FOksiGen',
          linkedMemberUserId: 'user2',
        }),
      );
    });

    it('backfill při startu: jen člen s přiřazenou postavou dostane konverzaci', async () => {
      mockWorldsService.findAll.mockResolvedValue([{ id: 'world1' }]);
      mockWorldsService.getSettings.mockResolvedValue(null);
      mockGroupRepo.findByWorldId.mockResolvedValue([mockGroup, postavyGroup]);
      mockChannelRepo.findByGroupId.mockResolvedValue([]);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { ...mockHracMembership, userId: 'u1', characterPath: 'aragorn' },
        { ...mockHracMembership, userId: 'u2', characterPath: undefined },
      ]);
      (service['usersRepo'].findById as jest.Mock).mockResolvedValue({
        id: 'u1',
        role: UserRole.Hrac,
        username: 'Hrac1',
      });
      mockChannelRepo.save.mockResolvedValue({ ...mockChannel, id: 'chc' });

      await service.onApplicationBootstrap();

      const saves = mockChannelRepo.save.mock.calls.filter(
        (c) => c[0].type === 'character',
      );
      expect(saves).toHaveLength(1);
      expect(saves[0][0]).toMatchObject({ linkedMemberUserId: 'u1' });
    });
  });

  describe('6.7b/c — updateMyChatPrefs', () => {
    it('člen: uloží jen poslaná pole (partial)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockMembershipRepo.update.mockResolvedValue({
        ...mockHracMembership,
        chatExpandedGroups: ['g1'],
      });
      const res = await service.updateMyChatPrefs('world1', 'user2', {
        expandedGroups: ['g1'],
      });
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m2', {
        chatExpandedGroups: ['g1'],
      });
      expect(res.chatExpandedGroups).toEqual(['g1']);
    });

    it('ne-člen světa → 403, nic neuloží', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.updateMyChatPrefs('world1', 'stranger', {
          groupOrder: ['g1'],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.update).not.toHaveBeenCalled();
    });

    it('D-032: uloží osobní pořadí připnutých (pinnedOrder)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockMembershipRepo.update.mockResolvedValue({
        ...mockHracMembership,
        chatPinnedOrder: ['c2', 'c1'],
      });
      const res = await service.updateMyChatPrefs('world1', 'user2', {
        pinnedOrder: ['c2', 'c1'],
      });
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m2', {
        chatPinnedOrder: ['c2', 'c1'],
      });
      expect(res.chatPinnedOrder).toEqual(['c2', 'c1']);
    });
  });

  describe('searchMessages', () => {
    it('krátký dotaz (< 2 znaky) vrátí prázdno', async () => {
      const r = await service.searchMessages('world1', mockPJ, { q: 'a' });
      expect(r).toEqual([]);
    });

    it('najde zprávu a doplní název konverzace', async () => {
      mockGroupRepo.findByWorldId.mockResolvedValue([mockGroup]);
      mockChannelRepo.findByWorldId.mockResolvedValue([mockChannel]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMessageRepo.searchInChannels.mockResolvedValue([
        {
          id: 'm1',
          channelId: 'ch1',
          senderName: 'Aragorn',
          content: 'našel jsem stopu',
          reactions: {},
          attachments: [],
          createdAt: new Date(),
        },
      ]);
      const r = await service.searchMessages('world1', mockPJ, {
        q: 'stopu',
      });
      expect(r).toHaveLength(1);
      expect(r[0].channelName).toBe('obecný');
      expect(r[0].content).toBe('našel jsem stopu');
    });
  });

  describe('sendMessage', () => {
    it('should save message and emit event', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      const mockMsg = {
        id: 'msg1',
        channelId: 'ch1',
        worldId: 'world1',
        senderId: 'user1',
        senderName: 'user1',
        content: 'ahoj',
        isEdited: false,
        isDeleted: false,
        reactions: {},
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockMessageRepo.save.mockResolvedValue(mockMsg);
      mockChannelRepo.update.mockResolvedValue({
        ...mockChannel,
        lastMessageAt: mockMsg.createdAt,
      });
      const result = await service.sendMessage(
        'ch1',
        { content: 'ahoj' },
        mockPJ,
      );
      expect(result.content).toBe('ahoj');
      expect(mockMessageRepo.save).toHaveBeenCalled();
    });

    it('odesílatel si vlastní zprávu auto-označuje jako přečtenou (regress)', async () => {
      // Bez tohoto upsertu by `countAfter(lastReadId)` v `getUnreadCounts`
      // započítal vlastní zprávu do unread countu pro odesílatele samotného
      // → badge na vlastní konverzaci po reloadu.
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockResolvedValue({
        id: 'msg-own',
        channelId: 'ch1',
        worldId: 'world1',
        senderId: mockPJ.id,
        senderName: mockPJ.username,
        content: 'vlastní zpráva',
        isEdited: false,
        isDeleted: false,
        reactions: {},
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      await service.sendMessage('ch1', { content: 'vlastní zpráva' }, mockPJ);
      expect(mockReadRepo.upsert).toHaveBeenCalledWith(
        mockPJ.id,
        'ch1',
        'msg-own',
      );
    });

    it('aktualizuje lastMessagePreview na konverzaci', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockResolvedValue({
        id: 'msg1',
        channelId: 'ch1',
        worldId: 'world1',
        senderId: 'user1',
        senderName: 'user1',
        content: 'Zdravím tě, poutníče',
        isEdited: false,
        isDeleted: false,
        reactions: {},
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      await service.sendMessage(
        'ch1',
        { content: 'Zdravím tě, poutníče' },
        mockPJ,
      );
      const updateArg = mockChannelRepo.update.mock.calls[0][1];
      expect(updateArg.lastMessagePreview).toBe('Zdravím tě, poutníče');
    });

    it('should throw ForbiddenException when no channel access', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.sendMessage(
          'ch1',
          { content: 'x' },
          { id: 'stranger', role: UserRole.Hrac, username: 'stranger' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('detekuje dice roll z content prefixu HOD FATE', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) =>
        Promise.resolve({
          id: 'msg1',
          channelId: 'ch1',
          worldId: 'world1',
          senderId: 'user1',
          senderName: 'user1',
          isEdited: false,
          isDeleted: false,
          reactions: {},
          attachments: [],
          customFont: null,
          color: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      const result = await service.sendMessage(
        'ch1',
        { content: '🎲 HOD FATE: 6' },
        mockPJ,
      );
      expect(result.isDiceRoll).toBe(true);
    });

    it('detekuje dice roll z prefixu Hod Kostkou', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) =>
        Promise.resolve({
          id: 'msg1',
          channelId: 'ch1',
          worldId: 'world1',
          senderId: 'user1',
          senderName: 'user1',
          isEdited: false,
          isDeleted: false,
          reactions: {},
          attachments: [],
          customFont: null,
          color: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      const result = await service.sendMessage(
        'ch1',
        { content: 'Hod Kostkou: 1d20 = 15' },
        mockPJ,
      );
      expect(result.isDiceRoll).toBe(true);
    });

    // Krok 6.3d — dicePayload v DTO je primární signál „toto je hod".
    it('dicePayload v DTO → isDiceRoll=true i bez regex match v content', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) =>
        Promise.resolve({
          id: 'msg1',
          channelId: 'ch1',
          worldId: 'world1',
          senderId: 'user1',
          senderName: 'user1',
          isEdited: false,
          isDeleted: false,
          reactions: {},
          attachments: [],
          customFont: null,
          color: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      const result = await service.sendMessage(
        'ch1',
        {
          content: 'jen text',
          dicePayload: {
            type: 'fate',
            faces: ['+', '-', '0', '+'],
            sum: 1,
            total: 1,
          },
          diceSkin: 'core-obsidian',
        },
        mockPJ,
      );
      expect(result.isDiceRoll).toBe(true);
      const savedArg = mockMessageRepo.save.mock.calls[0][0];
      expect(savedArg.dicePayload).toEqual({
        type: 'fate',
        faces: ['+', '-', '0', '+'],
        sum: 1,
        total: 1,
      });
      expect(savedArg.diceSkin).toBe('core-obsidian');
    });

    // Krok 6.3 — bez dicePayloadu i regexu zůstává default null.
    it('zpráva bez dicePayload i bez dice regex → dicePayload=null, diceSkin=null', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) =>
        Promise.resolve({
          id: 'msg1',
          channelId: 'ch1',
          worldId: 'world1',
          senderId: 'user1',
          senderName: 'user1',
          isEdited: false,
          isDeleted: false,
          reactions: {},
          attachments: [],
          customFont: null,
          color: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      await service.sendMessage('ch1', { content: 'běžný text' }, mockPJ);
      const savedArg = mockMessageRepo.save.mock.calls[0][0];
      expect(savedArg.dicePayload).toBeNull();
      expect(savedArg.diceSkin).toBeNull();
    });

    it('běžný text nedostane isDiceRoll', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) =>
        Promise.resolve({
          id: 'msg1',
          channelId: 'ch1',
          worldId: 'world1',
          senderId: 'user1',
          senderName: 'user1',
          isEdited: false,
          isDeleted: false,
          reactions: {},
          attachments: [],
          customFont: null,
          color: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      const result = await service.sendMessage(
        'ch1',
        { content: 'ahoj' },
        mockPJ,
      );
      expect(result.isDiceRoll).toBe(false);
    });

    it('uloží customFont a color do DB', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) =>
        Promise.resolve({
          id: 'msg1',
          channelId: 'ch1',
          worldId: 'world1',
          senderId: 'user1',
          senderName: 'user1',
          isEdited: false,
          isDeleted: false,
          reactions: {},
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      await service.sendMessage(
        'ch1',
        { content: 'x', customFont: 'Press Start 2P', color: 'red' },
        mockPJ,
      );
      const savedArg = mockMessageRepo.save.mock.calls[0][0];
      expect(savedArg.customFont).toBe('Press Start 2P');
      expect(savedArg.color).toBe('red');
    });

    it('klientův isDiceRoll v body je ignorován (whitelist)', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) =>
        Promise.resolve({
          id: 'msg1',
          channelId: 'ch1',
          worldId: 'world1',
          senderId: 'user1',
          senderName: 'user1',
          isEdited: false,
          isDeleted: false,
          reactions: {},
          attachments: [],
          customFont: null,
          color: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      // Cast přes `as never` protože isDiceRoll není v CreateMessageDto
      await service.sendMessage(
        'ch1',
        { content: 'běžný text', isDiceRoll: true } as never,
        mockPJ,
      );
      const savedArg = mockMessageRepo.save.mock.calls[0][0];
      expect(savedArg.isDiceRoll).toBe(false); // backend rozhodne dle content, ignoruje klienta
    });

    it('volá pushService.notifyUsers pro členy kanálu kromě sendera', async () => {
      // accessMode: 'members' channel — resolveChannelRecipients vrátí
      // allowedMemberIds.filter(!= sender) bez membershipRepo dotazu.
      mockChannelRepo.findById.mockResolvedValue({
        id: 'chan1',
        worldId: 'world1',
        accessMode: 'members',
        allowedMemberIds: ['userA', 'userB', 'userC'],
        allowedRoles: [],
      } as any);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        userId: 'userA',
        worldId: 'world1',
        role: 0, // Hrac
      } as any);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'userA', role: 1 },
        { userId: 'userB', role: 1 },
        { userId: 'userC', role: 1 },
      ] as any);
      mockMessageRepo.save.mockResolvedValue({
        id: 'msg1',
        channelId: 'chan1',
        worldId: 'world1',
        senderId: 'userA',
        senderName: 'userA',
        content: 'Hello',
        createdAt: new Date(),
      } as any);
      mockChannelRepo.update.mockResolvedValue(undefined as any);

      await service.sendMessage(
        'chan1',
        { content: 'Hello' },
        { id: 'userA', username: 'userA', role: UserRole.Hrac },
      );

      // Push je fire-and-forget v void async IIFE — flush microtask queue.
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPushService.notifyUsers).toHaveBeenCalled();
      const [recipientIds] = mockPushService.notifyUsers.mock.calls[0];
      expect(recipientIds).toEqual(expect.arrayContaining(['userB', 'userC']));
      expect(recipientIds).not.toContain('userA');
    });
  });

  describe('editMessage', () => {
    const mockMsg = {
      id: 'msg1',
      channelId: 'ch1',
      worldId: 'world1',
      senderId: 'user1',
      senderName: 'user1',
      content: 'original',
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should allow author to edit own message', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMessageRepo.update.mockResolvedValue({
        ...mockMsg,
        content: 'edited',
        isEdited: true,
      });
      const result = await service.editMessage(
        'msg1',
        { content: 'edited' },
        mockPJ,
      );
      expect(result.isEdited).toBe(true);
      expect(result.content).toBe('edited');
    });

    it('should throw ForbiddenException for non-author without manage permission', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.editMessage(
          'msg1',
          { content: 'hack' },
          { id: 'user2', role: UserRole.Hrac, username: 'user2' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow PJ to edit any message', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMessageRepo.update.mockResolvedValue({
        ...mockMsg,
        content: 'pj edit',
        isEdited: true,
      });
      const result = await service.editMessage(
        'msg1',
        { content: 'pj edit' },
        { id: 'user3', role: UserRole.Hrac, username: 'user3' },
      );
      expect(result.content).toBe('pj edit');
    });

    const msgWithAtt = {
      ...mockMsg,
      attachments: [
        {
          url: 'u1',
          publicId: 'p1',
          type: 'image' as const,
          mimeType: 'image/png',
          filename: 'a.png',
          size: 100,
        },
        {
          url: 'u2',
          publicId: 'p2',
          type: 'image' as const,
          mimeType: 'image/png',
          filename: 'b.png',
          size: 200,
        },
      ],
    };

    it('attachmentsToAdd přidá k existujícím', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...msgWithAtt, ...data }),
      );
      const newAtt = {
        url: 'u3',
        publicId: 'p3',
        type: 'image' as const,
        mimeType: 'image/png',
        filename: 'c.png',
        size: 300,
      };
      const result = await service.editMessage(
        'msg1',
        { attachmentsToAdd: [newAtt] },
        mockPJ,
      );
      expect(result.attachments).toHaveLength(3);
      expect(result.attachments?.map((a) => a.publicId)).toEqual([
        'p1',
        'p2',
        'p3',
      ]);
    });

    it('attachmentsToRemove odebere podle publicId', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...msgWithAtt, ...data }),
      );
      const result = await service.editMessage(
        'msg1',
        { attachmentsToRemove: ['p1'] },
        mockPJ,
      );
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments?.[0].publicId).toBe('p2');
    });

    it('attachmentsToAdd + attachmentsToRemove kombinace funguje', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...msgWithAtt, ...data }),
      );
      const newAtt = {
        url: 'u3',
        publicId: 'p3',
        type: 'image' as const,
        mimeType: 'image/png',
        filename: 'c.png',
        size: 300,
      };
      const result = await service.editMessage(
        'msg1',
        {
          attachmentsToRemove: ['p1'],
          attachmentsToAdd: [newAtt],
        },
        mockPJ,
      );
      expect(result.attachments?.map((a) => a.publicId)).toEqual(['p2', 'p3']);
    });

    it('attachmentsToRemove na neexistující publicId tiše ignoruje', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...msgWithAtt, ...data }),
      );
      const result = await service.editMessage(
        'msg1',
        { attachmentsToRemove: ['ghost'] },
        mockPJ,
      );
      expect(result.attachments).toHaveLength(2);
    });

    it('součet >10 attachmentů → 400', async () => {
      const fullMsg = {
        ...mockMsg,
        attachments: Array.from({ length: 9 }, (_, i) => ({
          url: `u${i}`,
          publicId: `p${i}`,
          type: 'image' as const,
          mimeType: 'image/png',
          filename: `f${i}.png`,
          size: 100,
        })),
      };
      mockMessageRepo.findById.mockResolvedValue(fullMsg);
      const newAtts = Array.from({ length: 2 }, (_, i) => ({
        url: `un${i}`,
        publicId: `np${i}`,
        type: 'image' as const,
        mimeType: 'image/png',
        filename: `n${i}.png`,
        size: 100,
      }));
      await expect(
        service.editMessage('msg1', { attachmentsToAdd: newAtts }, mockPJ),
      ).rejects.toThrow(BadRequestException);
    });

    it('prázdné body (žádné z trojice) → 400', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      await expect(service.editMessage('msg1', {}, mockPJ)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('content beze změny attachmentů — funguje', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...msgWithAtt, ...data }),
      );
      const result = await service.editMessage(
        'msg1',
        { content: 'edited' },
        mockPJ,
      );
      expect(result.content).toBe('edited');
      expect(result.attachments).toHaveLength(2); // beze změny
      // patch nesmí obsahovat attachments
      const patch = mockMessageRepo.update.mock.calls[0][1];
      expect(patch).not.toHaveProperty('attachments');
    });
  });

  describe('deleteMessage', () => {
    const mockMsg = {
      id: 'msg1',
      channelId: 'ch1',
      worldId: 'world1',
      senderId: 'user1',
      senderName: 'user1',
      content: 'text',
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments: [],
      isDiceRoll: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const diceMsg = {
      id: 'msg1',
      channelId: 'ch1',
      worldId: 'world1',
      senderId: 'user1',
      senderName: 'user1',
      content: '🎲 HOD FATE: 6',
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments: [],
      customFont: null,
      color: null,
      isDiceRoll: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should soft-delete message (content set, isDeleted=true)', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMessageRepo.update.mockResolvedValue({
        ...mockMsg,
        content: '*Zpráva byla smazána autorem*',
        isDeleted: true,
      });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalledWith('msg1', {
        isDeleted: true,
        content: '*Zpráva byla smazána autorem*',
      });
    });

    it('should throw NotFoundException for missing message', async () => {
      mockMessageRepo.findById.mockResolvedValue(null);
      await expect(service.deleteMessage('unknown', mockPJ)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-delete nastaví content na finální text', async () => {
      const normalMsg = { ...diceMsg, content: 'běžný', isDiceRoll: false };
      mockMessageRepo.findById.mockResolvedValue(normalMsg);
      mockMessageRepo.update.mockResolvedValue({
        ...normalMsg,
        isDeleted: true,
        content: '*Zpráva byla smazána autorem*',
      });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalledWith('msg1', {
        isDeleted: true,
        content: '*Zpráva byla smazána autorem*',
      });
    });

    it('Hrac vlastník nemůže smazat dice roll → 403', async () => {
      mockMessageRepo.findById.mockResolvedValue(diceMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      const ownerHrac = { id: 'user1', role: UserRole.Hrac, username: 'user1' };
      await expect(service.deleteMessage('msg1', ownerHrac)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('PomocnýPJ může smazat cizí dice roll', async () => {
      mockMessageRepo.findById.mockResolvedValue(diceMsg);
      const pomocnyPjMembership = {
        ...mockPJMembership,
        role: WorldRole.PomocnyPJ,
      };
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        pomocnyPjMembership,
      );
      mockMessageRepo.update.mockResolvedValue({
        ...diceMsg,
        isDeleted: true,
        content: '*Zpráva byla smazána autorem*',
      });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalled();
    });

    it('PJ může smazat dice roll', async () => {
      mockMessageRepo.findById.mockResolvedValue(diceMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMessageRepo.update.mockResolvedValue({
        ...diceMsg,
        isDeleted: true,
        content: '*Zpráva byla smazána autorem*',
      });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalled();
    });

    it('Globální Admin může smazat dice roll i bez membership', async () => {
      mockMessageRepo.findById.mockResolvedValue(diceMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMessageRepo.update.mockResolvedValue({
        ...diceMsg,
        isDeleted: true,
        content: '*Zpráva byla smazána autorem*',
      });
      await service.deleteMessage('msg1', mockAdmin);
      expect(mockMessageRepo.update).toHaveBeenCalled();
    });

    it('Globální Admin může smazat dice roll v global chatu (worldId=null)', async () => {
      const globalDice = { ...diceMsg, worldId: null };
      mockMessageRepo.findById.mockResolvedValue(globalDice);
      mockMessageRepo.update.mockResolvedValue({
        ...globalDice,
        isDeleted: true,
        content: '*Zpráva byla smazána autorem*',
      });
      await service.deleteMessage('msg1', mockAdmin);
      expect(mockMessageRepo.update).toHaveBeenCalled();
    });

    it('Hrac vlastník nemůže smazat dice roll v global chatu', async () => {
      const globalDice = { ...diceMsg, worldId: null };
      mockMessageRepo.findById.mockResolvedValue(globalDice);
      const ownerHrac = { id: 'user1', role: UserRole.Hrac, username: 'user1' };
      await expect(service.deleteMessage('msg1', ownerHrac)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getMessages limit validation', () => {
    it('should clamp NaN limit to default 50', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockMessageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('ch1', 'user2', { limit: NaN });
      expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith('ch1', {
        before: undefined,
        limit: 50,
        visibilityUserId: 'user2',
      });
    });

    it('should clamp limit=0 to default 50', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockMessageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('ch1', 'user2', { limit: 0 });
      expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith('ch1', {
        before: undefined,
        limit: 50,
        visibilityUserId: 'user2',
      });
    });

    it('should clamp limit=200 to max 100', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockMessageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('ch1', 'user2', { limit: 200 });
      expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith('ch1', {
        before: undefined,
        limit: 100,
        visibilityUserId: 'user2',
      });
    });
  });

  describe('handleWorldCreated', () => {
    it('založí výchozí kanály Globální + Postavy', async () => {
      const world = {
        id: 'world1',
      } as import('../worlds/interfaces/world.interface').World;
      mockGroupRepo.save.mockResolvedValueOnce({
        ...mockGroup,
        name: 'Globální',
        id: 'g1',
      });
      mockGroupRepo.save.mockResolvedValueOnce({
        ...mockGroup,
        name: 'Postavy',
        id: 'g2',
      });
      mockChannelRepo.save.mockResolvedValue(mockChannel);
      await service.handleWorldCreated(world);
      expect(mockGroupRepo.save).toHaveBeenCalledTimes(2);
      // 6.7a — kanál „Postavy" vzniká prázdný; jen „globální" konverzace.
      expect(mockChannelRepo.save).toHaveBeenCalledTimes(1);
      expect(mockGroupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Globální' }),
      );
      expect(mockGroupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Postavy' }),
      );
    });
  });

  describe('handleWorldSettingsUpdated', () => {
    it('založí kanál za novou družinu, existující přeskočí', async () => {
      mockGroupRepo.findByWorldId.mockResolvedValue([
        { ...mockGroup, id: 'g1', name: 'Globální' },
        {
          ...mockGroup,
          id: 'g2',
          name: 'Severka',
          linkedWorldGroup: 'Severka',
        },
      ]);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockGroupRepo.save.mockResolvedValue({
        ...mockGroup,
        id: 'g3',
        name: 'Jižani',
      });
      mockChannelRepo.save.mockResolvedValue(mockChannel);
      await service.handleWorldSettingsUpdated({
        worldId: 'world1',
        settings: { customGroups: ['Severka', 'Jižani'] } as never,
      });
      // „Severka" už kanál má → jen „Jižani" se založí.
      expect(mockGroupRepo.save).toHaveBeenCalledTimes(1);
      expect(mockGroupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jižani',
          linkedWorldGroup: 'Jižani',
        }),
      );
      const savedChannel = mockChannelRepo.save.mock.calls[0][0];
      expect(savedChannel.accessMode).toBe('members');
    });
  });

  describe('ChatMessage interface — reactions field', () => {
    it('mockMsg should have reactions field (type check)', () => {
      const msg: import('./interfaces/chat-message.interface').ChatMessage = {
        id: 'msg1',
        channelId: 'ch1',
        worldId: 'world1',
        senderId: 'user1',
        senderName: 'Elara',
        content: 'text',
        isEdited: false,
        isDeleted: false,
        reactions: { '👍': ['user2'] },
        customFont: null,
        customFontSize: null,
        color: null,
        isDiceRoll: false,
        mentions: [],
        dicePayload: null,
        diceSkin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(msg.reactions['👍']).toContain('user2');
    });
  });

  describe('ChatMessage interface — attachments field', () => {
    it('mockMsg should have attachments field (type check)', () => {
      const msg: import('./interfaces/chat-message.interface').ChatMessage = {
        id: 'msg1',
        channelId: 'ch1',
        worldId: 'world1',
        senderId: 'user1',
        senderName: 'Elara',
        content: 'text',
        isEdited: false,
        isDeleted: false,
        reactions: {},
        attachments: [
          {
            url: 'https://example.com/a.jpg',
            publicId: 'abc',
            type: 'image',
            mimeType: 'image/jpeg',
            filename: 'a.jpg',
            size: 1024,
          },
        ],
        customFont: null,
        customFontSize: null,
        color: null,
        isDiceRoll: false,
        mentions: [],
        dicePayload: null,
        diceSkin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(msg.attachments![0].type).toBe('image');
    });
  });
});

describe('sendMessage — new fields', () => {
  const baseMockMsg = {
    id: 'msg1',
    channelId: 'ch1',
    worldId: 'world1',
    senderId: 'user1',
    senderName: 'Elara',
    senderAvatarUrl: 'http://avatar.png',
    content: 'ahoj',
    isEdited: false,
    isDeleted: false,
    reactions: {},
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let service: ChatService;
  const mockGroupRepo = {
    findById: jest.fn(),
    findByWorldId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    bulkUpdateOrders: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(),
    findByGroupId: jest.fn(),
    findByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    bulkUpdateOrders: jest.fn(),
    addCombatant: jest.fn(),
    updateCombatant: jest.fn(),
    removeCombatant: jest.fn(),
    setCombat: jest.fn(),
    setCombatConfig: jest.fn(),
  };
  const mockMessageRepo = {
    findById: jest.fn(),
    findByChannelId: jest.fn(),
    findByNonce: jest.fn().mockResolvedValue(null),
    countAfter: jest.fn(),
    countMentionsAfter: jest.fn(),
    searchInChannels: jest.fn(),
    findFeed: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDeleteByChannelId: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(),
    findByUserAndChannels: jest.fn(),
    upsert: jest.fn(),
    deleteByChannelId: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByCharacterPathAndWorld: jest.fn(),
    findByCharacterPathsAndWorld: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        ChatPresenceService,
        {
          provide: UploadService,
          useValue: { assertAttachmentsOrigin: jest.fn() },
        },
        { provide: CharactersService, useValue: mockCharactersService },
        { provide: WorldsService, useValue: mockWorldsService },
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        {
          provide: WorldElevationsService,
          useValue: {
            isElevated: jest.fn().mockResolvedValue(false),
            listWorldIdsForUser: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'IUsersRepository',
          useValue: {
            findByUsernames: jest.fn().mockResolvedValue([]),
            findById: jest.fn(),
          },
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: PushService,
          useValue: { notifyUsers: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  it('should snapshot senderAvatarUrl from membership', async () => {
    const membership = {
      ...mockPJMembership,
      avatarUrl: 'http://avatar.png',
      characterPath: 'Elara',
    };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(baseMockMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage('ch1', { content: 'ahoj' }, mockPJ);
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ senderAvatarUrl: 'http://avatar.png' }),
    );
  });

  it('should throw ForbiddenException when non-PJ sets overrideName', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    await expect(
      service.sendMessage(
        'ch1',
        { content: 'x', overrideName: 'NPC' },
        { id: 'user2', role: UserRole.Hrac, username: 'user2' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow PJ to set overrideName', async () => {
    const membership = {
      ...mockPJMembership,
      avatarUrl: undefined,
      characterPath: 'PJ',
    };
    const msgWithOverride = { ...baseMockMsg, overrideName: 'Starý kovář' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(msgWithOverride);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    const result = await service.sendMessage(
      'ch1',
      { content: 'x', overrideName: 'Starý kovář' },
      mockPJ,
    );
    expect(result.overrideName).toBe('Starý kovář');
  });

  it('should persist overridePageSlug together with overrideName (6.2-followup)', async () => {
    const membership = { ...mockPJMembership, characterPath: 'PJ' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(baseMockMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage(
      'ch1',
      {
        content: 'x',
        overrideName: 'Starý kovář',
        overridePageSlug: 'stary-kovar',
      },
      mockPJ,
    );
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ overridePageSlug: 'stary-kovar' }),
    );
  });

  it('should drop overridePageSlug without overrideName (6.2-followup)', async () => {
    const membership = { ...mockPJMembership, characterPath: 'PJ' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(baseMockMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage(
      'ch1',
      { content: 'x', overridePageSlug: 'stary-kovar' },
      mockPJ,
    );
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ overridePageSlug: undefined }),
    );
  });

  it('should populate replyToPreview from cited message', async () => {
    const citedMsg = {
      ...baseMockMsg,
      id: 'cited1',
      content: 'původní zpráva',
      senderName: 'Elara',
    };
    const replyMsg = {
      ...baseMockMsg,
      replyToId: 'cited1',
      replyToPreview: 'původní zpráva',
      replyToSenderName: 'Elara',
    };
    const membership = {
      ...mockPJMembership,
      avatarUrl: undefined,
      characterPath: 'Elara',
    };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.findById.mockResolvedValue(citedMsg);
    mockMessageRepo.save.mockResolvedValue(replyMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage(
      'ch1',
      { content: 'odpověď', replyToId: 'cited1' },
      mockPJ,
    );
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToId: 'cited1',
        replyToPreview: 'původní zpráva',
        replyToSenderName: 'Elara',
      }),
    );
  });

  it('should add senderId to visibleTo for whisper', async () => {
    const membership = {
      ...mockPJMembership,
      avatarUrl: undefined,
      characterPath: 'Elara',
    };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue({
      ...baseMockMsg,
      visibleTo: ['user1', 'user2'],
    });
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage(
      'ch1',
      { content: 'šepot', visibleTo: ['user2'] },
      mockPJ,
    );
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        visibleTo: expect.arrayContaining(['user1', 'user2']),
      }),
    );
  });
});

describe('toggleReaction', () => {
  const mockMsg = {
    id: 'msg1',
    channelId: 'ch1',
    worldId: 'world1',
    senderId: 'user1',
    senderName: 'Elara',
    content: 'text',
    isEdited: false,
    isDeleted: false,
    reactions: {},
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let service: ChatService;
  const mockGroupRepo = {
    findById: jest.fn(),
    findByWorldId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    bulkUpdateOrders: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(),
    findByGroupId: jest.fn(),
    findByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    bulkUpdateOrders: jest.fn(),
    addCombatant: jest.fn(),
    updateCombatant: jest.fn(),
    removeCombatant: jest.fn(),
    setCombat: jest.fn(),
    setCombatConfig: jest.fn(),
  };
  const mockMessageRepo = {
    findById: jest.fn(),
    findByChannelId: jest.fn(),
    findByNonce: jest.fn().mockResolvedValue(null),
    countAfter: jest.fn(),
    countMentionsAfter: jest.fn(),
    searchInChannels: jest.fn(),
    findFeed: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDeleteByChannelId: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
    addReactionIfAbsent: jest.fn(),
    removeReactionIfPresent: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(),
    findByUserAndChannels: jest.fn(),
    upsert: jest.fn(),
    deleteByChannelId: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByCharacterPathAndWorld: jest.fn(),
    findByCharacterPathsAndWorld: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        ChatPresenceService,
        {
          provide: UploadService,
          useValue: { assertAttachmentsOrigin: jest.fn() },
        },
        { provide: CharactersService, useValue: mockCharactersService },
        { provide: WorldsService, useValue: mockWorldsService },
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        {
          provide: WorldElevationsService,
          useValue: {
            isElevated: jest.fn().mockResolvedValue(false),
            listWorldIdsForUser: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'IUsersRepository',
          useValue: {
            findByUsernames: jest.fn().mockResolvedValue([]),
            findById: jest.fn(),
          },
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: PushService,
          useValue: { notifyUsers: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  it('should add reaction when user has not reacted yet', async () => {
    mockMessageRepo.findById.mockResolvedValue(mockMsg);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    mockMessageRepo.addReactionIfAbsent.mockResolvedValue({
      ...mockMsg,
      reactions: { '👍': ['user2'] },
    });
    const result = await service.toggleReaction('msg1', '👍', {
      id: 'user2',
      role: UserRole.Hrac,
      username: 'user2',
    });
    expect(mockMessageRepo.addReactionIfAbsent).toHaveBeenCalledWith(
      'msg1',
      '👍',
      'user2',
    );
    expect(result.reactions['👍']).toContain('user2');
  });

  it('should remove reaction when user already reacted', async () => {
    const msgWithReaction = { ...mockMsg, reactions: { '👍': ['user2'] } };
    mockMessageRepo.findById.mockResolvedValue(msgWithReaction);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    mockMessageRepo.removeReactionIfPresent.mockResolvedValue({
      ...mockMsg,
      reactions: { '👍': [] },
    });
    await service.toggleReaction('msg1', '👍', {
      id: 'user2',
      role: UserRole.Hrac,
      username: 'user2',
    });
    expect(mockMessageRepo.removeReactionIfPresent).toHaveBeenCalledWith(
      'msg1',
      '👍',
      'user2',
    );
    expect(mockMessageRepo.addReactionIfAbsent).not.toHaveBeenCalled();
  });

  it('FIX-40: race — CAS miss falls back to opposite action', async () => {
    mockMessageRepo.findById.mockResolvedValue(mockMsg);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    // Stale snapshot says "not reacted" → primary attempt is addReactionIfAbsent,
    // but a concurrent toggle already added it (CAS filter no longer matches).
    mockMessageRepo.addReactionIfAbsent.mockResolvedValue(null);
    mockMessageRepo.removeReactionIfPresent.mockResolvedValue({
      ...mockMsg,
      reactions: { '👍': [] },
    });
    const result = await service.toggleReaction('msg1', '👍', {
      id: 'user2',
      role: UserRole.Hrac,
      username: 'user2',
    });
    expect(mockMessageRepo.addReactionIfAbsent).toHaveBeenCalledWith(
      'msg1',
      '👍',
      'user2',
    );
    expect(mockMessageRepo.removeReactionIfPresent).toHaveBeenCalledWith(
      'msg1',
      '👍',
      'user2',
    );
    expect(result.reactions['👍']).toEqual([]);
  });

  it('should throw NotFoundException for missing message', async () => {
    mockMessageRepo.findById.mockResolvedValue(null);
    await expect(
      service.toggleReaction('unknown', '👍', mockPJ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when no channel access', async () => {
    mockMessageRepo.findById.mockResolvedValue(mockMsg);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
    await expect(
      service.toggleReaction('msg1', '👍', {
        id: 'stranger',
        role: UserRole.Hrac,
        username: 'stranger',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});

// D-NEW-chat-mention-character — resolve `@<character-slug>` na userId
describe('sendMessage — character mentions', () => {
  let service: ChatService;
  const mockGroupRepo = {
    findById: jest.fn(),
    findByWorldId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    bulkUpdateOrders: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(),
    findByGroupId: jest.fn(),
    findByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    bulkUpdateOrders: jest.fn(),
    addCombatant: jest.fn(),
    updateCombatant: jest.fn(),
    removeCombatant: jest.fn(),
    setCombat: jest.fn(),
    setCombatConfig: jest.fn(),
  };
  const savedMessages: Array<Record<string, unknown>> = [];
  const mockMessageRepo = {
    findById: jest.fn(),
    findByChannelId: jest.fn(),
    findByNonce: jest.fn().mockResolvedValue(null),
    countAfter: jest.fn(),
    countMentionsAfter: jest.fn(),
    searchInChannels: jest.fn(),
    findFeed: jest.fn(),
    save: jest.fn().mockImplementation((m: Record<string, unknown>) => {
      const saved = { ...m, id: 'msg-new', createdAt: new Date() };
      savedMessages.push(saved);
      return Promise.resolve(saved);
    }),
    update: jest.fn(),
    softDeleteByChannelId: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(),
    findByUserAndChannels: jest.fn(),
    upsert: jest.fn(),
    deleteByChannelId: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByCharacterPathAndWorld: jest.fn(),
    findByCharacterPathsAndWorld: jest.fn(),
  };
  const mockUsersRepo = { findByUsernames: jest.fn() };

  beforeEach(async () => {
    savedMessages.length = 0;
    mockChannelRepo.findById.mockResolvedValue({
      id: 'ch1',
      groupId: 'g1',
      worldId: 'world1',
      accessMode: 'all',
      allowedRoles: [2, 3, 4, 5],
      allowedMemberIds: [],
      hiddenForMemberIds: [],
    });
    mockChannelRepo.update.mockResolvedValue(undefined);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
      id: 'm1',
      userId: 'sender-id',
      worldId: 'world1',
      role: 2,
      joinedAt: new Date(),
      avatarUrl: 'http://avatar.png',
      characterPath: 'Sender',
      akj: 0,
    });
    mockMembershipRepo.findByWorldId.mockResolvedValue([]);
    mockReadRepo.findByUserAndChannel.mockResolvedValue(null);
    mockMessageRepo.countAfter.mockResolvedValue(0);
    mockMessageRepo.countMentionsAfter.mockResolvedValue(0);

    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        ChatPresenceService,
        {
          provide: UploadService,
          useValue: { assertAttachmentsOrigin: jest.fn() },
        },
        { provide: CharactersService, useValue: mockCharactersService },
        {
          provide: WorldsService,
          useValue: { findById: jest.fn().mockResolvedValue({ id: 'world1' }) },
        },
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        {
          provide: WorldElevationsService,
          useValue: {
            isElevated: jest.fn().mockResolvedValue(false),
            listWorldIdsForUser: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: PushService,
          useValue: { notifyUsers: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get(ChatService);
  });

  it('matchne username → mentions obsahují userId, character lookup se přeskočí', async () => {
    mockUsersRepo.findByUsernames.mockResolvedValue([
      { id: 'u-friend', username: 'friend' },
    ]);
    mockMembershipRepo.findByCharacterPathsAndWorld.mockResolvedValue([]);

    await service.sendMessage(
      'ch1',
      { content: 'Ahoj @friend, jak je?' },
      { id: 'sender-id', role: UserRole.Hrac, username: 'sender' },
    );

    expect(
      mockMembershipRepo.findByCharacterPathsAndWorld,
    ).not.toHaveBeenCalled();
    expect(savedMessages[0]?.mentions).toEqual(['u-friend']);
  });

  it('username miss → fallback na character slug, resolve userId z membership', async () => {
    mockUsersRepo.findByUsernames.mockResolvedValue([]);
    mockMembershipRepo.findByCharacterPathsAndWorld.mockResolvedValue([
      {
        id: 'm-x',
        userId: 'u-char-owner',
        worldId: 'world1',
        role: 2,
        joinedAt: new Date(),
        characterPath: 'frantikuv-synek',
        akj: 0,
      },
    ]);

    await service.sendMessage(
      'ch1',
      { content: 'Ahoj @frantikuv-synek!' },
      { id: 'sender-id', role: UserRole.Hrac, username: 'sender' },
    );

    expect(
      mockMembershipRepo.findByCharacterPathsAndWorld,
    ).toHaveBeenCalledWith('world1', ['frantikuv-synek']);
    expect(savedMessages[0]?.mentions).toEqual(['u-char-owner']);
  });

  it('mix username + character mention v jedné zprávě', async () => {
    mockUsersRepo.findByUsernames.mockResolvedValue([
      { id: 'u-friend', username: 'friend' },
    ]);
    mockMembershipRepo.findByCharacterPathsAndWorld.mockResolvedValue([
      {
        id: 'm-x',
        userId: 'u-char-owner',
        worldId: 'world1',
        role: 2,
        joinedAt: new Date(),
        characterPath: 'frantikuv-synek',
        akj: 0,
      },
    ]);

    await service.sendMessage(
      'ch1',
      { content: '@friend řekni @frantikuv-synek ať přijde' },
      { id: 'sender-id', role: UserRole.Hrac, username: 'sender' },
    );

    expect(savedMessages[0]?.mentions).toEqual(
      expect.arrayContaining(['u-friend', 'u-char-owner']),
    );
  });
});

describe('sendMessage — attachments', () => {
  const membership = {
    ...mockPJMembership,
    avatarUrl: undefined,
    characterPath: 'Elara',
  };
  const attachment = {
    url: 'https://res.cloudinary.com/test.jpg',
    publicId: 'chat/world1/ch1/abc',
    type: 'image' as const,
    mimeType: 'image/jpeg',
    filename: 'img.jpg',
    size: 1024,
  };

  let service: ChatService;
  const mockGroupRepo = {
    findById: jest.fn(),
    findByWorldId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    bulkUpdateOrders: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(),
    findByGroupId: jest.fn(),
    findByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    bulkUpdateOrders: jest.fn(),
    addCombatant: jest.fn(),
    updateCombatant: jest.fn(),
    removeCombatant: jest.fn(),
    setCombat: jest.fn(),
    setCombatConfig: jest.fn(),
  };
  const mockMessageRepo = {
    findById: jest.fn(),
    findByChannelId: jest.fn(),
    findByNonce: jest.fn().mockResolvedValue(null),
    countAfter: jest.fn(),
    countMentionsAfter: jest.fn(),
    searchInChannels: jest.fn(),
    findFeed: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDeleteByChannelId: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(),
    findByUserAndChannels: jest.fn(),
    upsert: jest.fn(),
    deleteByChannelId: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByCharacterPathAndWorld: jest.fn(),
    findByCharacterPathsAndWorld: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        ChatPresenceService,
        {
          provide: UploadService,
          useValue: { assertAttachmentsOrigin: jest.fn() },
        },
        { provide: CharactersService, useValue: mockCharactersService },
        { provide: WorldsService, useValue: mockWorldsService },
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        {
          provide: WorldElevationsService,
          useValue: {
            isElevated: jest.fn().mockResolvedValue(false),
            listWorldIdsForUser: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'IUsersRepository',
          useValue: {
            findByUsernames: jest.fn().mockResolvedValue([]),
            findById: jest.fn(),
          },
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: PushService,
          useValue: { notifyUsers: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  it('should throw BadRequestException when neither content nor attachments provided', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    await expect(service.sendMessage('ch1', {} as any, mockPJ)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should allow message with only attachments (no content)', async () => {
    const mockMsg = {
      id: 'msg1',
      channelId: 'ch1',
      worldId: 'world1',
      senderId: 'user1',
      senderName: 'Elara',
      content: null,
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments: [attachment],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(mockMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    const result = await service.sendMessage(
      'ch1',
      { attachments: [attachment] },
      mockPJ,
    );
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].type).toBe('image');
  });
});

describe('findChannelForUpload', () => {
  let service: ChatService;
  const mockGroupRepo = {
    findById: jest.fn(),
    findByWorldId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    bulkUpdateOrders: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(),
    findByGroupId: jest.fn(),
    findByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    bulkUpdateOrders: jest.fn(),
    addCombatant: jest.fn(),
    updateCombatant: jest.fn(),
    removeCombatant: jest.fn(),
    setCombat: jest.fn(),
    setCombatConfig: jest.fn(),
  };
  const mockMessageRepo = {
    findById: jest.fn(),
    findByChannelId: jest.fn(),
    findByNonce: jest.fn().mockResolvedValue(null),
    countAfter: jest.fn(),
    countMentionsAfter: jest.fn(),
    searchInChannels: jest.fn(),
    findFeed: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDeleteByChannelId: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(),
    findByUserAndChannels: jest.fn(),
    upsert: jest.fn(),
    deleteByChannelId: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByCharacterPathAndWorld: jest.fn(),
    findByCharacterPathsAndWorld: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        ChatPresenceService,
        {
          provide: UploadService,
          useValue: { assertAttachmentsOrigin: jest.fn() },
        },
        { provide: CharactersService, useValue: mockCharactersService },
        { provide: WorldsService, useValue: mockWorldsService },
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        {
          provide: WorldElevationsService,
          useValue: {
            isElevated: jest.fn().mockResolvedValue(false),
            listWorldIdsForUser: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'IUsersRepository',
          useValue: {
            findByUsernames: jest.fn().mockResolvedValue([]),
            findById: jest.fn(),
          },
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: PushService,
          useValue: { notifyUsers: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  it('should return channel when user has access', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
    const result = await service.findChannelForUpload('ch1', 'user1');
    expect(result.id).toBe('ch1');
  });

  it('should throw NotFoundException for unknown channel', async () => {
    mockChannelRepo.findById.mockResolvedValue(null);
    await expect(
      service.findChannelForUpload('unknown', 'user1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when no channel access', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
    await expect(
      service.findChannelForUpload('ch1', 'stranger'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('getMessages — whisper filtering', () => {
  const publicMsg = {
    id: 'msg1',
    channelId: 'ch1',
    worldId: 'world1',
    senderId: 'user1',
    senderName: 'Elara',
    content: 'veřejná',
    isEdited: false,
    isDeleted: false,
    reactions: {},
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const whisperMsg = {
    ...publicMsg,
    id: 'msg2',
    content: 'šepot',
    visibleTo: ['user1', 'user2'],
  };

  let service: ChatService;
  const mockGroupRepo = {
    findById: jest.fn(),
    findByWorldId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    bulkUpdateOrders: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(),
    findByGroupId: jest.fn(),
    findByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    bulkUpdateOrders: jest.fn(),
    addCombatant: jest.fn(),
    updateCombatant: jest.fn(),
    removeCombatant: jest.fn(),
    setCombat: jest.fn(),
    setCombatConfig: jest.fn(),
  };
  const mockMessageRepo = {
    findById: jest.fn(),
    findByChannelId: jest.fn(),
    findByNonce: jest.fn().mockResolvedValue(null),
    countAfter: jest.fn(),
    countMentionsAfter: jest.fn(),
    searchInChannels: jest.fn(),
    findFeed: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDeleteByChannelId: jest.fn(),
    softDeleteByWorldId: jest.fn(),
    restoreByWorldId: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(),
    findByUserAndChannels: jest.fn(),
    upsert: jest.fn(),
    deleteByChannelId: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByCharacterPathAndWorld: jest.fn(),
    findByCharacterPathsAndWorld: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        ChatPresenceService,
        {
          provide: UploadService,
          useValue: { assertAttachmentsOrigin: jest.fn() },
        },
        { provide: CharactersService, useValue: mockCharactersService },
        { provide: WorldsService, useValue: mockWorldsService },
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        {
          provide: WorldElevationsService,
          useValue: {
            isElevated: jest.fn().mockResolvedValue(false),
            listWorldIdsForUser: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'IUsersRepository',
          useValue: {
            findByUsernames: jest.fn().mockResolvedValue([]),
            findById: jest.fn(),
          },
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: PushService,
          useValue: { notifyUsers: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  // Filtr šepotů se přesunul z JS service do Mongo query (findByChannelId
  // `visibilityUserId`) — aby `limit` = počet VIDITELNÝCH zpráv (jinak hráči po
  // ořezu cizích šepotů vyjde < limit a FE stránkování „Zobrazit starší" selže).
  // Mock repo tu simuluje DB filtr podle visibilityUserId; testy tak ověří, že
  // service předá správný visibilityUserId (PomocnyPJ+ = undefined → vidí vše).
  const simulateVisibility = () =>
    mockMessageRepo.findByChannelId.mockImplementation(
      (_channelId: string, opts: { visibilityUserId?: string }) =>
        Promise.resolve(
          [publicMsg, whisperMsg].filter((m) => {
            const vt = (m as { visibleTo?: string[] }).visibleTo;
            return (
              opts.visibilityUserId == null ||
              !vt ||
              vt.length === 0 ||
              vt.includes(opts.visibilityUserId)
            );
          }),
        ),
    );

  it('should hide whisper from user not in visibleTo', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
      ...mockHracMembership,
      userId: 'user3',
    });
    simulateVisibility();
    const result = await service.getMessages('ch1', 'user3', {});
    expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith(
      'ch1',
      expect.objectContaining({ visibilityUserId: 'user3' }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('msg1');
  });

  it('should show whisper to sender', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    simulateVisibility();
    const result = await service.getMessages('ch1', 'user1', {});
    expect(result).toHaveLength(2);
  });

  it('should show all whispers to PJ', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
    simulateVisibility();
    const result = await service.getMessages('ch1', 'user1', {});
    expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith(
      'ch1',
      expect.objectContaining({ visibilityUserId: undefined }),
    );
    expect(result).toHaveLength(2);
  });

  describe('updateChannel — přesun mezi kanály', () => {
    it('PJ může přesunout konverzaci do jiného kanálu ve stejném světě', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.findById.mockResolvedValue({
        ...mockGroup,
        id: 'group2',
        worldId: 'world1',
      });
      mockChannelRepo.update.mockResolvedValue({
        ...mockChannel,
        groupId: 'group2',
      });
      const result = await service.updateChannel(
        'ch1',
        { groupId: 'group2' },
        mockPJ,
      );
      expect(result.groupId).toBe('group2');
    });

    it('Forbidden při přesunu do kanálu jiného světa', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.findById.mockResolvedValue({
        ...mockGroup,
        id: 'foreign',
        worldId: 'world2',
      });
      await expect(
        service.updateChannel('ch1', { groupId: 'foreign' }, mockPJ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockChannelRepo.update).not.toHaveBeenCalled();
    });

    it('NotFound při přesunu do neexistujícího kanálu', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.findById.mockResolvedValue(null);
      await expect(
        service.updateChannel('ch1', { groupId: 'ghost' }, mockPJ),
      ).rejects.toThrow(NotFoundException);
    });

    it('beze změny groupId přesun nevaliduje (nehledá target group)', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.update.mockResolvedValue({
        ...mockChannel,
        name: 'nové',
      });
      await service.updateChannel('ch1', { name: 'nové' }, mockPJ);
      expect(mockGroupRepo.findById).not.toHaveBeenCalled();
    });

    it('propaguje imageUrl konverzace přes update', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.update.mockImplementation((_id, dto) =>
        Promise.resolve({ ...mockChannel, ...dto }),
      );
      const result = await service.updateChannel(
        'ch1',
        { imageUrl: 'https://img/ch.png' },
        mockPJ,
      );
      expect(result.imageUrl).toBe('https://img/ch.png');
    });
  });

  // Krok 6.3e — diceSkinMapping persistence v membership appearance.
  describe('updateMembershipAppearance — diceSkinMapping (6.3e)', () => {
    it('persistuje diceSkinMapping per typ kostky', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockPJMembership,
        diceSkinMapping: null,
      });
      mockMembershipRepo.update.mockImplementation((_id, patch) =>
        Promise.resolve({
          ...mockPJMembership,
          ...patch,
        }),
      );
      const result = await service.updateMembershipAppearance(
        'world1',
        mockPJ.id,
        {
          diceSkinMapping: {
            default: 'core-obsidian',
            '1d20': 'elemental-flame',
          },
        },
      );
      expect(result.diceSkinMapping).toEqual({
        default: 'core-obsidian',
        '1d20': 'elemental-flame',
      });
      const patchArg = mockMembershipRepo.update.mock.calls[0][1];
      expect(patchArg.diceSkinMapping).toEqual({
        default: 'core-obsidian',
        '1d20': 'elemental-flame',
      });
    });

    it('null v dto.diceSkinMapping resetuje na fallback', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockPJMembership,
        diceSkinMapping: { default: 'core-obsidian' },
      });
      mockMembershipRepo.update.mockImplementation((_id, patch) =>
        Promise.resolve({
          ...mockPJMembership,
          diceSkinMapping: (patch as Record<string, unknown>).diceSkinMapping,
        } as never),
      );
      const result = await service.updateMembershipAppearance(
        'world1',
        mockPJ.id,
        { diceSkinMapping: null },
      );
      expect(result.diceSkinMapping).toBeNull();
    });

    it('getMembershipAppearance vrací diceSkinMapping z membershipu', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockPJMembership,
        diceSkinMapping: { default: 'undead-bone' },
      });
      const result = await service.getMembershipAppearance('world1', mockPJ.id);
      expect(result.diceSkinMapping).toEqual({ default: 'undead-bone' });
    });
  });

  // Krok 6.3 D-NEW-dice-jail — uvězněné skiny.
  describe('updateMembershipAppearance — jailedDiceSkins (D-NEW-dice-jail)', () => {
    it('persistuje seznam uvězněných skinů', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockPJMembership,
        jailedDiceSkins: [],
      });
      mockMembershipRepo.update.mockImplementation((_id, patch) =>
        Promise.resolve({
          ...mockPJMembership,
          ...patch,
        }),
      );
      const result = await service.updateMembershipAppearance(
        'world1',
        mockPJ.id,
        { jailedDiceSkins: ['core-ivory', 'undead-bone'] },
      );
      expect(result.jailedDiceSkins).toEqual(['core-ivory', 'undead-bone']);
    });

    it('prázdné pole odemkne všechny skiny', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockPJMembership,
        jailedDiceSkins: ['core-ivory'],
      });
      mockMembershipRepo.update.mockImplementation((_id, patch) =>
        Promise.resolve({
          ...mockPJMembership,
          jailedDiceSkins: (patch as Record<string, unknown>)
            .jailedDiceSkins as string[],
        } as never),
      );
      const result = await service.updateMembershipAppearance(
        'world1',
        mockPJ.id,
        { jailedDiceSkins: [] },
      );
      expect(result.jailedDiceSkins).toEqual([]);
    });

    it('getMembershipAppearance vrací jailedDiceSkins', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockPJMembership,
        jailedDiceSkins: ['draconic-emerald'],
      });
      const result = await service.getMembershipAppearance('world1', mockPJ.id);
      expect(result.jailedDiceSkins).toEqual(['draconic-emerald']);
    });
  });

  // D-040 — chat messages enrichnuti senderIsDeleted po tombstone lookup.
  describe('D-040 tombstone enrichment', () => {
    it('getMessages → smazaný odesílatel dostane senderIsDeleted: true', async () => {
      mockChannelRepo.findById.mockResolvedValue({
        ...mockChannel,
        worldId: 'world1',
        isDeleted: false,
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockMessageRepo.findByChannelId.mockResolvedValue([
        {
          id: 'm1',
          channelId: 'ch1',
          worldId: 'world1',
          senderId: 'userGhost',
          senderName: 'Bob',
          content: 'Ahoj',
          isEdited: false,
          isDeleted: false,
          reactions: {},
          customFont: null,
          customFontSize: null,
          color: null,
          isDiceRoll: false,
          mentions: [],
          dicePayload: null,
          diceSkin: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockUsersService.findManyTombstoneInfo.mockResolvedValueOnce(
        new Map([
          ['userGhost', { isDeleted: true, displayName: 'Smazaný účet' }],
        ]),
      );
      const result = await service.getMessages('ch1', 'user1', {});
      expect(result[0].senderIsDeleted).toBe(true);
    });
  });
});
