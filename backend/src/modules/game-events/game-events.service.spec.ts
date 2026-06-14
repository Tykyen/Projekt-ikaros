import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GameEventsService } from './game-events.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { PushService } from '../push/push.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const mockPJUser = { id: 'pj1', role: UserRole.Ikarus, username: 'pj' };
const mockHracUser = { id: 'h1', role: UserRole.Ikarus, username: 'hrac' };
const mockAdminUser = { id: 'a1', role: UserRole.Admin, username: 'admin' };

const mockPJMembership = {
  id: 'm1',
  userId: 'pj1',
  worldId: 'w1',
  role: WorldRole.PJ,
  joinedAt: new Date(),
  akj: 0,
};
const mockHracMembership = {
  id: 'm2',
  userId: 'h1',
  worldId: 'w1',
  role: WorldRole.Hrac,
  joinedAt: new Date(),
  akj: 0,
  group: 'mages',
};
const mockHracOtherGroup = {
  id: 'm3',
  userId: 'h2',
  worldId: 'w1',
  role: WorldRole.Hrac,
  joinedAt: new Date(),
  akj: 0,
  group: 'rogues',
};

const baseEvent = {
  id: 'e1',
  worldId: 'w1',
  title: 'Test',
  date: '2026-06-01T18:00',
  description: '',
  imageUrl: null,
  targetGroup: null,
  groupOnly: false,
  confirmable: false,
  confirmedBy: [],
  comments: [],
  reminderSent: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Flush microtasks + tick — protože create() spouští notifyOnCreate jako void fire-and-forget,
// po awaitu service.create musíme propláchnout event loop, aby se push mock skutečně volal.
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('GameEventsService', () => {
  let service: GameEventsService;
  const mockRepo = {
    findById: jest.fn(),
    findList: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findUpcoming: jest.fn(),
    findUpcomingForWorlds: jest.fn(),
    markReminderSent: jest.fn(),
  };
  const mockMembershipRepo = {
    findById: jest.fn(),
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockWorldsRepo = { findById: jest.fn(), findByIds: jest.fn() };
  const mockPushService = {
    notifyUsers: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GameEventsService,
        { provide: 'IGameEventRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: PushService, useValue: mockPushService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(GameEventsService);
    jest.clearAllMocks();
  });

  describe('viditelnost', () => {
    it('člen světa vidí ne-groupOnly event', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.findById.mockResolvedValue(baseEvent);
      const result = await service.findById('e1', mockHracUser);
      expect(result.id).toBe('e1');
    });

    it('ne-člen skupiny dostane 404 na groupOnly event', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracOtherGroup,
      );
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        targetGroup: 'mages',
        groupOnly: true,
      });
      await expect(
        service.findById('e1', {
          id: 'h2',
          role: UserRole.Ikarus,
          username: 'h2',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('PJ vidí groupOnly event i mimo skupinu', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        targetGroup: 'mages',
        groupOnly: true,
      });
      const result = await service.findById('e1', mockPJUser);
      expect(result.id).toBe('e1');
    });

    it('Admin vidí groupOnly event bez ohledu na membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        targetGroup: 'mages',
        groupOnly: true,
      });
      const result = await service.findById('e1', mockAdminUser);
      expect(result.id).toBe('e1');
    });

    it('non-member dostane 404', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(baseEvent);
      await expect(service.findById('e1', mockHracUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findList', () => {
    const eventPublic = { ...baseEvent, id: 'e1' };
    const eventGroupOnly = {
      ...baseEvent,
      id: 'e2',
      targetGroup: 'mages',
      groupOnly: true,
    };
    const eventTargetButNotOnly = {
      ...baseEvent,
      id: 'e3',
      targetGroup: 'mages',
      groupOnly: false,
    };

    it('člen skupiny vidí všechny tři eventy', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      ); // group: mages
      mockRepo.findList.mockResolvedValue([
        eventPublic,
        eventGroupOnly,
        eventTargetButNotOnly,
      ]);
      const result = await service.findList({ worldId: 'w1' }, mockHracUser);
      expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    });

    it('ne-člen skupiny vidí jen ne-groupOnly eventy', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracOtherGroup,
      ); // group: rogues
      mockRepo.findList.mockResolvedValue([
        eventPublic,
        eventGroupOnly,
        eventTargetButNotOnly,
      ]);
      const result = await service.findList(
        { worldId: 'w1' },
        { id: 'h2', role: UserRole.Ikarus, username: 'h2' },
      );
      expect(result.map((e) => e.id)).toEqual(['e1', 'e3']);
    });

    it('non-member dostane prázdný list', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findList.mockResolvedValue([eventPublic]);
      const result = await service.findList({ worldId: 'w1' }, mockHracUser);
      expect(result).toEqual([]);
    });

    it('Admin vidí všechny bez ohledu na membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findList.mockResolvedValue([eventPublic, eventGroupOnly]);
      const result = await service.findList({ worldId: 'w1' }, mockAdminUser);
      expect(result.map((e) => e.id)).toEqual(['e1', 'e2']);
    });

    it('limit cap na 500', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.findList.mockResolvedValue([]);
      await service.findList({ worldId: 'w1', limit: 9999 }, mockHracUser);
      expect(mockRepo.findList).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 }),
      );
    });
  });

  describe('create', () => {
    const validInput = {
      worldId: 'w1',
      title: 'Test akce',
      date: '2026-06-01T18:00',
      description: 'Popis',
    };
    const mockWorld = { id: 'w1', name: 'Tamriel' };
    const created = { ...baseEvent, id: 'e1', title: 'Test akce' };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockRepo.create.mockResolvedValue(created);
    });

    it('PJ vytvoří event', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        mockPJMembership,
        mockHracMembership,
      ]);
      const result = await service.create(validInput, mockPJUser);
      expect(result.id).toBe('e1');
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Hráč nemůže (403)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(service.create(validInput, mockHracUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('groupOnly: true && targetGroup: null → 400', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      await expect(
        service.create({ ...validInput, groupOnly: true }, mockPJUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('push se pošle všem aktivním členům světa (ne-groupOnly)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        mockPJMembership,
        mockHracMembership,
      ]);
      await service.create(validInput, mockPJUser);
      await flush();
      expect(mockPushService.notifyUsers).toHaveBeenCalledWith(
        expect.arrayContaining(['pj1', 'h1']),
        expect.objectContaining({
          title: expect.stringContaining('Tamriel'),
          body: 'Test akce',
        }),
      );
    });

    it('push při groupOnly jde jen členům targetGroup + PJ/PomocnýPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        mockPJMembership,
        mockHracMembership,
        mockHracOtherGroup,
      ]);
      mockRepo.create.mockResolvedValue({
        ...created,
        targetGroup: 'mages',
        groupOnly: true,
      });
      await service.create(
        { ...validInput, targetGroup: 'mages', groupOnly: true },
        mockPJUser,
      );
      await flush();
      const recipients: string[] = mockPushService.notifyUsers.mock.calls[0][0];
      expect(recipients).toContain('pj1'); // PJ — bypass
      expect(recipients).toContain('h1'); // Hrac group=mages
      expect(recipients).not.toContain('h2'); // Hrac group=rogues
    });

    it('push selhání nesmí shodit POST', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockPushService.notifyUsers.mockRejectedValueOnce(new Error('boom'));
      const result = await service.create(validInput, mockPJUser);
      await flush();
      expect(result.id).toBe('e1');
    });

    it('Pending členové push nedostanou', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      const pending = {
        ...mockHracMembership,
        userId: 'pending1',
        role: WorldRole.Zadatel,
      };
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        mockPJMembership,
        mockHracMembership,
        pending,
      ]);
      await service.create(validInput, mockPJUser);
      await flush();
      const recipients: string[] = mockPushService.notifyUsers.mock.calls[0][0];
      expect(recipients).not.toContain('pending1');
    });

    it('Admin může vytvořit i bez membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.findByWorldId.mockResolvedValue([]);
      const result = await service.create(validInput, mockAdminUser);
      expect(result.id).toBe('e1');
    });
  });

  describe('update', () => {
    it('PJ může editovat', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockResolvedValue({ ...baseEvent, title: 'Změněno' });
      const result = await service.update(
        'e1',
        { title: 'Změněno' },
        mockPJUser,
      );
      expect(result.title).toBe('Změněno');
    });

    it('Hráč nemůže (403)', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.update('e1', { title: 'X' }, mockHracUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('confirmedBy: null v body nesmaže existující', async () => {
      const eventWithConfirmed = {
        ...baseEvent,
        confirmedBy: [{ userId: 'u1', userName: 'U1' }],
      };
      mockRepo.findById.mockResolvedValue(eventWithConfirmed);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...eventWithConfirmed, ...data }),
      );
      await service.update('e1', { title: 'X', confirmedBy: null }, mockPJUser);
      const updateCall = mockRepo.update.mock.calls[0][1];
      expect(updateCall).not.toHaveProperty('confirmedBy');
    });

    it('confirmedBy: pole hodnoty se zapíše', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockResolvedValue(baseEvent);
      await service.update(
        'e1',
        { confirmedBy: [{ userId: 'x', userName: 'X' }] },
        mockPJUser,
      );
      const updateCall = mockRepo.update.mock.calls[0][1];
      expect(updateCall.confirmedBy).toEqual([{ userId: 'x', userName: 'X' }]);
    });

    it('groupOnly: true && targetGroup: null → 400', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      await expect(
        service.update(
          'e1',
          { groupOnly: true, targetGroup: null },
          mockPJUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('groupOnly: true && existing targetGroup zůstává — OK', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        targetGroup: 'mages',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockResolvedValue({
        ...baseEvent,
        targetGroup: 'mages',
        groupOnly: true,
      });
      const result = await service.update(
        'e1',
        { groupOnly: true },
        mockPJUser,
      );
      expect(result.groupOnly).toBe(true);
    });

    it('404 při neexistujícím eventu', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.update('e1', { title: 'X' }, mockPJUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('PJ může smazat', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('e1', mockPJUser);
      expect(mockRepo.delete).toHaveBeenCalledWith('e1');
    });

    it('Hráč nemůže (403)', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(service.delete('e1', mockHracUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('404 při neexistujícím', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('e1', mockPJUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirm', () => {
    const confirmableEvent = { ...baseEvent, confirmable: true };

    it('toggle ADD pro confirmable event', async () => {
      mockRepo.findById.mockResolvedValue({
        ...confirmableEvent,
        confirmedBy: [],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...confirmableEvent, ...data }),
      );
      const result = await service.confirm('e1', mockHracUser);
      expect(result.confirmedBy).toEqual([{ userId: 'h1', userName: 'hrac' }]);
    });

    it('toggle REMOVE odebere existující', async () => {
      mockRepo.findById.mockResolvedValue({
        ...confirmableEvent,
        confirmedBy: [{ userId: 'h1', userName: 'hrac' }],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...confirmableEvent, ...data }),
      );
      const result = await service.confirm('e1', mockHracUser);
      expect(result.confirmedBy).toEqual([]);
    });

    it('confirmable: false → 400', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(service.confirm('e1', mockHracUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('non-member dostane 404 (nevidí event)', async () => {
      mockRepo.findById.mockResolvedValue(confirmableEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.confirm('e1', mockHracUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('groupOnly bez membership v group → 404', async () => {
      mockRepo.findById.mockResolvedValue({
        ...confirmableEvent,
        targetGroup: 'mages',
        groupOnly: true,
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracOtherGroup,
      );
      await expect(
        service.confirm('e1', {
          id: 'h2',
          role: UserRole.Ikarus,
          username: 'h2',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('comments — add', () => {
    it('člen přidá root komentář', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.addComment(
        'e1',
        { content: 'Ahoj' },
        mockHracUser,
      );
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toMatchObject({
        content: 'Ahoj',
        authorId: 'h1',
        authorName: 'hrac',
        parentId: null,
        isDeleted: false,
      });
      expect(result.comments[0].id).toMatch(/^[0-9a-f-]+$/);
    });

    it('reply na root komentář OK', async () => {
      const root = {
        id: 'c1',
        parentId: null,
        authorId: 'pj1',
        authorName: 'pj',
        content: 'Root',
        createdAt: new Date(),
        editedAt: null,
        reactions: {},
        isDeleted: false,
      };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [root] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.addComment(
        'e1',
        { content: 'Reply', parentId: 'c1' },
        mockHracUser,
      );
      expect(result.comments).toHaveLength(2);
      expect(result.comments[1].parentId).toBe('c1');
    });

    it('reply na non-root (parentId má vlastní parentId) → 400', async () => {
      const root = {
        id: 'c1',
        parentId: null,
        authorId: 'pj1',
        authorName: 'pj',
        content: 'R',
        createdAt: new Date(),
        editedAt: null,
        reactions: {},
        isDeleted: false,
      };
      const reply = {
        id: 'c2',
        parentId: 'c1',
        authorId: 'h1',
        authorName: 'hrac',
        content: 'X',
        createdAt: new Date(),
        editedAt: null,
        reactions: {},
        isDeleted: false,
      };
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [root, reply],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.addComment(
          'e1',
          { content: 'X', parentId: 'c2' },
          mockHracUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('reply na neexistující parent → 400', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.addComment(
          'e1',
          { content: 'X', parentId: 'ghost' },
          mockHracUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('non-member dostane 404 (nevidí event)', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.addComment('e1', { content: 'X' }, mockHracUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('comments — edit', () => {
    const myComment = {
      id: 'c1',
      parentId: null,
      authorId: 'h1',
      authorName: 'hrac',
      content: 'Old',
      createdAt: new Date(),
      editedAt: null,
      reactions: {},
      isDeleted: false,
    };

    it('vlastník edituje', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [myComment],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.editComment(
        'e1',
        'c1',
        { content: 'New' },
        mockHracUser,
      );
      expect(result.comments[0].content).toBe('New');
      expect(result.comments[0].editedAt).not.toBeNull();
    });

    it('cizí komentář → 403', async () => {
      const other = { ...myComment, authorId: 'someone' };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [other] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.editComment('e1', 'c1', { content: 'X' }, mockHracUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('smazaný komentář → 400', async () => {
      const deleted = { ...myComment, isDeleted: true, content: '' };
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [deleted],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.editComment('e1', 'c1', { content: 'X' }, mockHracUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('neexistující → 404', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.editComment('e1', 'ghost', { content: 'X' }, mockHracUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('comments — delete (soft)', () => {
    const myComment = {
      id: 'c1',
      parentId: null,
      authorId: 'h1',
      authorName: 'hrac',
      content: 'Old',
      createdAt: new Date(),
      editedAt: null,
      reactions: {},
      isDeleted: false,
    };
    const otherComment = { ...myComment, authorId: 'someone', authorName: 'X' };

    it('vlastník soft-delete', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [myComment],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.deleteComment('e1', 'c1', mockHracUser);
      expect(result.comments[0].isDeleted).toBe(true);
      expect(result.comments[0].content).toBe('');
      expect(result.comments[0].authorName).toBe('hrac');
    });

    it('cizí jako Hráč → 403', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [otherComment],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.deleteComment('e1', 'c1', mockHracUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cizí jako PJ → OK', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [otherComment],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.deleteComment('e1', 'c1', mockPJUser);
      expect(result.comments[0].isDeleted).toBe(true);
    });

    it('cizí jako globální Admin → OK', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [otherComment],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.deleteComment('e1', 'c1', mockAdminUser);
      expect(result.comments[0].isDeleted).toBe(true);
    });

    it('idempotent — smazání už smazaného nezmění nic', async () => {
      const already = { ...myComment, isDeleted: true, content: '' };
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [already],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.deleteComment('e1', 'c1', mockHracUser);
      expect(result.comments[0].isDeleted).toBe(true);
    });
  });

  describe('comments — reactions', () => {
    const myComment = {
      id: 'c1',
      parentId: null,
      authorId: 'pj1',
      authorName: 'pj',
      content: 'X',
      createdAt: new Date(),
      editedAt: null,
      reactions: {},
      isDeleted: false,
    };

    it('toggle ADD reakce', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [myComment],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.reactToComment(
        'e1',
        'c1',
        { emoji: '👍' },
        mockHracUser,
      );
      expect(result.comments[0].reactions).toEqual({ '👍': ['h1'] });
    });

    it('toggle REMOVE reakce', async () => {
      const withReact = { ...myComment, reactions: { '👍': ['h1'] } };
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [withReact],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.reactToComment(
        'e1',
        'c1',
        { emoji: '👍' },
        mockHracUser,
      );
      expect(result.comments[0].reactions['👍']).toBeUndefined();
    });

    it('REMOVE poslední reakce smaže klíč emoji', async () => {
      const withReact = {
        ...myComment,
        reactions: { '👍': ['h1'], '❤️': ['pj1'] },
      };
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [withReact],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...baseEvent, ...data }),
      );
      const result = await service.reactToComment(
        'e1',
        'c1',
        { emoji: '👍' },
        mockHracUser,
      );
      expect(result.comments[0].reactions).toEqual({ '❤️': ['pj1'] });
    });

    it('reakce na smazaný komentář → 200 bez efektu', async () => {
      const deleted = { ...myComment, isDeleted: true, content: '' };
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [deleted],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      const result = await service.reactToComment(
        'e1',
        'c1',
        { emoji: '👍' },
        mockHracUser,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(result.comments[0].reactions).toEqual({});
    });

    it('non-member dostane 404', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseEvent,
        comments: [myComment],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.reactToComment('e1', 'c1', { emoji: '👍' }, mockHracUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('neexistující komentář → 404', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.reactToComment('e1', 'ghost', { emoji: '👍' }, mockHracUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findUpcomingForUser', () => {
    const worldA = { id: 'w1', name: 'Matrix', slug: 'matrix' };
    const worldB = { id: 'w2', name: 'DnD', slug: 'dnd' };
    const memberInA = { ...mockHracMembership, worldId: 'w1' };
    const memberInB = {
      id: 'm4',
      userId: 'h1',
      worldId: 'w2',
      role: WorldRole.Hrac,
      joinedAt: new Date(),
      akj: 0,
      group: 'A',
    };
    const eventEarly = {
      ...baseEvent,
      id: 'eEarly',
      worldId: 'w1',
      title: 'Brzy',
      date: '2099-01-01T18:00',
    };
    const eventLate = {
      ...baseEvent,
      id: 'eLate',
      worldId: 'w2',
      title: 'Pozdě',
      date: '2099-12-31T18:00',
    };

    it('vrátí prázdné pole pokud user nemá žádné membershipy', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([]);
      const result = await service.findUpcomingForUser(mockHracUser, 5);
      expect(result).toEqual([]);
      expect(mockRepo.findUpcomingForWorlds).not.toHaveBeenCalled();
    });

    it('vyfiltruje membership s rolí Zadatel', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { ...memberInA, role: WorldRole.Zadatel },
      ]);
      const result = await service.findUpcomingForUser(mockHracUser, 5);
      expect(result).toEqual([]);
      expect(mockRepo.findUpcomingForWorlds).not.toHaveBeenCalled();
    });

    it('respektuje groupOnly + targetGroup', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([memberInA]);
      mockRepo.findUpcomingForWorlds.mockResolvedValue([
        {
          ...baseEvent,
          id: 'e1',
          worldId: 'w1',
          groupOnly: true,
          targetGroup: 'rogues',
        },
        {
          ...baseEvent,
          id: 'e2',
          worldId: 'w1',
          groupOnly: true,
          targetGroup: 'mages',
        },
      ]);
      mockWorldsRepo.findByIds.mockResolvedValue([worldA]);
      const result = await service.findUpcomingForUser(mockHracUser, 5);
      expect(result.map((e) => e.id)).toEqual(['e2']);
    });

    it('setřídí podle date vzestupně (delegováno na repo) a vyplní world meta', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([memberInA, memberInB]);
      mockRepo.findUpcomingForWorlds.mockResolvedValue([eventEarly, eventLate]);
      mockWorldsRepo.findByIds.mockResolvedValue([worldA, worldB]);
      const result = await service.findUpcomingForUser(mockHracUser, 5);
      expect(result.map((e) => e.id)).toEqual(['eEarly', 'eLate']);
      expect(result[0].worldName).toBe('Matrix');
      expect(result[0].worldSlug).toBe('matrix');
      expect(result[1].worldName).toBe('DnD');
    });

    it('respektuje limit (slice na safeLimit)', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([memberInA]);
      mockRepo.findUpcomingForWorlds.mockResolvedValue([
        { ...baseEvent, id: 'a' },
        { ...baseEvent, id: 'b' },
        { ...baseEvent, id: 'c' },
      ]);
      mockWorldsRepo.findByIds.mockResolvedValue([worldA]);
      const result = await service.findUpcomingForUser(mockHracUser, 2);
      expect(result.map((e) => e.id)).toEqual(['a', 'b']);
    });

    it('cap limit na 20 (safeLimit horní hranice)', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([memberInA]);
      mockRepo.findUpcomingForWorlds.mockResolvedValue([]);
      mockWorldsRepo.findByIds.mockResolvedValue([worldA]);
      await service.findUpcomingForUser(mockHracUser, 999);
      // safeLimit=20 → fetchCap=20*5=100
      expect(mockRepo.findUpcomingForWorlds).toHaveBeenCalledWith(
        ['w1'],
        expect.any(String),
        100,
      );
    });

    it('myRsvp = confirmed pokud user je v confirmedBy', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([memberInA]);
      mockRepo.findUpcomingForWorlds.mockResolvedValue([
        {
          ...baseEvent,
          confirmedBy: [{ userId: 'h1', userName: 'hrac' }],
        },
      ]);
      mockWorldsRepo.findByIds.mockResolvedValue([worldA]);
      const result = await service.findUpcomingForUser(mockHracUser, 5);
      expect(result[0].myRsvp).toBe('confirmed');
      expect(result[0].confirmedCount).toBe(1);
    });

    it('myRsvp = none pokud user není v confirmedBy', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([memberInA]);
      mockRepo.findUpcomingForWorlds.mockResolvedValue([
        {
          ...baseEvent,
          confirmedBy: [{ userId: 'other', userName: 'jiny' }],
        },
      ]);
      mockWorldsRepo.findByIds.mockResolvedValue([worldA]);
      const result = await service.findUpcomingForUser(mockHracUser, 5);
      expect(result[0].myRsvp).toBe('none');
      expect(result[0].confirmedCount).toBe(1);
    });

    it('volá repo s aktuálním ISO timestampem v fromDate', async () => {
      const before = new Date().toISOString();
      mockMembershipRepo.findByUserId.mockResolvedValue([memberInA]);
      mockRepo.findUpcomingForWorlds.mockResolvedValue([]);
      mockWorldsRepo.findByIds.mockResolvedValue([worldA]);
      await service.findUpcomingForUser(mockHracUser, 5);
      const callArgs = mockRepo.findUpcomingForWorlds.mock.calls[0];
      expect(callArgs[0]).toEqual(['w1']);
      expect(callArgs[1] >= before).toBe(true);
      expect(callArgs[2]).toBe(25); // 5 * 5
    });
  });

  // ── 9.1-I — image focal point ────────────────────────────────────────────
  describe('image focal point', () => {
    const mockWorld = { id: 'w1', name: 'Tamriel' };

    beforeEach(() => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
    });

    it('create propaguje imageFocalX/Y do repo', async () => {
      mockRepo.create.mockResolvedValue({ ...baseEvent });
      await service.create(
        {
          worldId: 'w1',
          title: 'T',
          date: '2026-06-01T18:00',
          imageUrl: 'https://example.com/img.png',
          imageFocalX: 25,
          imageFocalY: 75,
        },
        mockPJUser,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ imageFocalX: 25, imageFocalY: 75 }),
      );
    });

    it('create bez focal posílá null/null', async () => {
      mockRepo.create.mockResolvedValue({ ...baseEvent });
      await service.create(
        { worldId: 'w1', title: 'T', date: '2026-06-01T18:00' },
        mockPJUser,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ imageFocalX: null, imageFocalY: null }),
      );
    });

    it('update propaguje imageFocalX/Y a podporuje null reset', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent });
      mockRepo.update.mockResolvedValue({ ...baseEvent });
      await service.update(
        'e1',
        { imageFocalX: 10, imageFocalY: null },
        mockPJUser,
      );
      expect(mockRepo.update).toHaveBeenCalledWith(
        'e1',
        expect.objectContaining({ imageFocalX: 10, imageFocalY: null }),
      );
    });
  });

  // ── 9.1-I — toDate filter + archive role gate ────────────────────────────
  describe('archive role gate (toDate + auto-clamp)', () => {
    const eventOld = {
      ...baseEvent,
      id: 'old',
      date: '2020-01-01T10:00',
    };
    const eventNew = {
      ...baseEvent,
      id: 'new',
      date: '2030-01-01T10:00',
    };

    it('PJ smí archiv (toDate v minulosti)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.findList.mockResolvedValue([eventOld]);
      const result = await service.findList(
        { worldId: 'w1', toDate: '2020-12-31T00:00' },
        mockPJUser,
      );
      expect(result.map((e) => e.id)).toEqual(['old']);
      expect(mockRepo.findList).toHaveBeenCalledWith(
        expect.objectContaining({ toDate: '2020-12-31T00:00' }),
      );
    });

    it('Hráč + toDate → 403 ARCHIVE_PJ_ONLY', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.findList(
          { worldId: 'w1', toDate: '2020-12-31T00:00' },
          mockHracUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Hráč + fromDate v minulosti (před cutoffem) → 403', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      await expect(
        service.findList(
          { worldId: 'w1', fromDate: '2020-01-01T00:00' },
          mockHracUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Hráč bez filtru dostane auto-clamp na fromDate=cutoff', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.findList.mockResolvedValue([eventNew]);
      await service.findList({ worldId: 'w1' }, mockHracUser);
      const callArg = mockRepo.findList.mock.calls[0][0];
      expect(callArg.fromDate).toBeDefined();
      // Cutoff = now − 24h; očekáváme < now + tolerance
      const cutoff = new Date(callArg.fromDate);
      const now = new Date();
      expect(now.getTime() - cutoff.getTime()).toBeGreaterThanOrEqual(
        23 * 60 * 60 * 1000,
      );
      expect(now.getTime() - cutoff.getTime()).toBeLessThanOrEqual(
        25 * 60 * 60 * 1000,
      );
    });

    it('Hráč + fromDate v budoucnosti (po cutoffem) → OK, žádný auto-clamp', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockHracMembership,
      );
      mockRepo.findList.mockResolvedValue([eventNew]);
      await service.findList(
        { worldId: 'w1', fromDate: '2030-01-01T00:00' },
        mockHracUser,
      );
      expect(mockRepo.findList).toHaveBeenCalledWith(
        expect.objectContaining({ fromDate: '2030-01-01T00:00' }),
      );
    });

    it('PomocnyPJ smí archiv (default jako PJ)', async () => {
      const pomocnyMembership = {
        ...mockPJMembership,
        role: WorldRole.PomocnyPJ,
      };
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        pomocnyMembership,
      );
      mockRepo.findList.mockResolvedValue([eventOld]);
      const result = await service.findList(
        { worldId: 'w1', toDate: '2020-12-31T00:00' },
        mockHracUser,
      );
      expect(result.map((e) => e.id)).toEqual(['old']);
    });

    it('Admin smí archiv bez membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findList.mockResolvedValue([eventOld]);
      const result = await service.findList(
        { worldId: 'w1', toDate: '2020-12-31T00:00' },
        mockAdminUser,
      );
      expect(result.map((e) => e.id)).toEqual(['old']);
    });

    it('toDate propaguje do repo i pro Admina', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findList.mockResolvedValue([]);
      await service.findList(
        { worldId: 'w1', toDate: '2020-12-31T00:00' },
        mockAdminUser,
      );
      expect(mockRepo.findList).toHaveBeenCalledWith(
        expect.objectContaining({ toDate: '2020-12-31T00:00' }),
      );
    });
  });
});
