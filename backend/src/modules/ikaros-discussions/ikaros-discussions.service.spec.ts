import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockDiscussion = {
  id: 'disc1',
  title: 'Diskuze',
  description: 'Popis',
  bulletin: '',
  creatorId: 'user1',
  creatorName: 'Tvůrce',
  isApproved: false,
  isOpen: true,
  managerIds: ['user1'],
  invitedUserIds: [],
  joinRequestIds: [],
  postCount: 0,
  likeCount: 0,
  createdAtUtc: new Date(),
  lastActivityUtc: new Date(),
};

const mockPost = {
  id: 'post1',
  discussionId: 'disc1',
  authorId: 'user2',
  authorName: 'Autor',
  content: 'Obsah příspěvku',
  createdAtUtc: new Date(),
};

describe('IkarosDiscussionsService', () => {
  let service: IkarosDiscussionsService;
  const mockRepo = {
    findAll: jest.fn(),
    findAllPaginated: jest.fn(),
    findPending: jest.fn(),
    findPendingPaginated: jest.fn(),
    countPending: jest.fn(),
    findManagedWithJoinRequests: jest.fn(),
    findByIds: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    adjustLikeCount: jest.fn(),
    adjustPostCount: jest.fn(),
    delete: jest.fn(),
  };
  const mockPostsRepo = {
    findByDiscussion: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteByDiscussion: jest.fn(),
  };
  const mockReportsRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findUnresolved: jest.fn(),
    countUnresolved: jest.fn(),
    markResolved: jest.fn(),
  };
  const mockUsersRepo = {
    findByRoles: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  };
  // D-040 — tombstone batch enrich; default = všichni autoři aktivní.
  const mockUsersService = {
    findManyTombstoneInfo: jest.fn().mockResolvedValue(new Map()),
  };
  const mockMsgService = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosDiscussionsService,
        { provide: 'IIkarosDiscussionsRepository', useValue: mockRepo },
        {
          provide: 'IIkarosDiscussionPostsRepository',
          useValue: mockPostsRepo,
        },
        {
          provide: 'IIkarosDiscussionReportsRepository',
          useValue: mockReportsRepo,
        },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: UsersService, useValue: mockUsersService },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
      ],
    }).compile();
    service = module.get(IkarosDiscussionsService);
  });

  describe('isAdmin', () => {
    it('SpravceDiskuzi je admin', () =>
      expect(service.isAdmin(UserRole.SpravceDiskuzi, 'nekdo')).toBe(true));
    it('Tyky je admin', () =>
      expect(service.isAdmin(UserRole.Hrac, 'Tyky')).toBe(true));
    it('Hráč není admin', () =>
      expect(service.isAdmin(UserRole.Hrac, 'nekdo')).toBe(false));
    it('PJ NENÍ admin diskuzí (3.4 — platformový obsah)', () =>
      expect(service.isAdmin(UserRole.PJ, 'nekdo')).toBe(false));
  });

  describe('create', () => {
    it('admin vytvoří diskuzi rovnou schválenou', async () => {
      mockRepo.create.mockResolvedValue({
        ...mockDiscussion,
        isApproved: true,
      });
      const result = await service.create(
        { title: 'X', description: 'Y' },
        'user1',
        'Admin',
        UserRole.Admin,
        'Admin',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isApproved: true }),
      );
      expect(result.isApproved).toBe(true);
    });

    it('non-admin vytvoří neschválenou diskuzi a notifikuje adminy', async () => {
      mockRepo.create.mockResolvedValue(mockDiscussion);
      mockUsersRepo.findByRoles.mockResolvedValue([
        { id: 'a1', username: 'Admin' },
      ]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.create(
        { title: 'X', description: 'Y' },
        'user1',
        'Hráč',
        UserRole.Hrac,
        'hrac',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isApproved: false }),
      );
      expect(mockMsgService.create).toHaveBeenCalled();
    });

    it('creatorId je auto-přidán do managerIds', async () => {
      mockRepo.create.mockResolvedValue(mockDiscussion);
      mockUsersRepo.findByRoles.mockResolvedValue([]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.create(
        { title: 'X', description: 'Y' },
        'user1',
        'Hráč',
        UserRole.Hrac,
        'hrac',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ managerIds: ['user1'] }),
      );
    });
  });

  describe('findAll', () => {
    it('admin vidí vše', async () => {
      const all = [
        mockDiscussion,
        { ...mockDiscussion, id: 'disc2', isApproved: false },
      ];
      mockRepo.findAll.mockResolvedValue(all);
      const result = await service.findAll('admin', UserRole.Admin, 'Admin');
      expect(result).toHaveLength(2);
    });

    it('hráč vidí jen schválené otevřené nebo kde má přístup', async () => {
      const openApproved = {
        ...mockDiscussion,
        isApproved: true,
        isOpen: true,
      };
      const closedNotInvited = {
        ...mockDiscussion,
        id: 'd2',
        isApproved: true,
        isOpen: false,
        invitedUserIds: [],
        managerIds: [],
        creatorId: 'other',
      };
      mockRepo.findAll.mockResolvedValue([openApproved, closedNotInvited]);
      const result = await service.findAll('user1', UserRole.Hrac, 'hrac');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('disc1');
    });

    // N-12 — `total` musí odpovídat počtu PŘÍSTUPNÝCH diskuzí (po access filtru),
    // ne DB countu všech — jinak FE počítá špatný počet stránek.
    it('findAllPaginated: total = počet přístupných, ne všech v DB', async () => {
      const openApproved = {
        ...mockDiscussion,
        isApproved: true,
        isOpen: true,
      };
      const hidden = {
        ...mockDiscussion,
        id: 'd2',
        isApproved: false, // hráč nevidí
      };
      mockRepo.findAll.mockResolvedValue([openApproved, hidden]);
      const result = await service.findAllPaginated(
        'user1',
        UserRole.Hrac,
        'hrac',
        0,
        10,
      );
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('disc1');
    });
  });

  describe('approve', () => {
    it('admin schválí diskuzi, notifikuje tvůrce', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      mockRepo.update.mockResolvedValue({
        ...mockDiscussion,
        isApproved: true,
      });
      await service.approve('disc1', UserRole.Admin, 'Admin');
      expect(mockRepo.update).toHaveBeenCalledWith('disc1', {
        isApproved: true,
      });
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Vaše diskuze byla schválena',
          recipientId: 'user1',
        }),
        expect.anything(),
      );
    });
  });

  describe('reject', () => {
    it('smaže diskuzi i všechny příspěvky, notifikuje tvůrce', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      mockRepo.delete.mockResolvedValue(true);
      mockPostsRepo.deleteByDiscussion.mockResolvedValue(undefined);
      await service.reject('disc1', 'Nevyhovuje', UserRole.Admin, 'Admin');
      expect(mockPostsRepo.deleteByDiscussion).toHaveBeenCalledWith('disc1');
      expect(mockRepo.delete).toHaveBeenCalledWith('disc1');
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Vaše diskuze byla zamítnuta',
          recipientId: 'user1',
        }),
        expect.anything(),
      );
    });

    it('hodí ForbiddenException pro non-admina', async () => {
      await expect(
        service.reject('disc1', undefined, UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('toggleFavorite', () => {
    it('přidá diskuzi do oblíbených pokud tam není', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user1',
        favoriteDiscussionIds: [],
      });
      mockUsersRepo.update.mockResolvedValue({
        id: 'user1',
        favoriteDiscussionIds: ['disc1'],
      });
      const result = await service.toggleFavorite('disc1', 'user1');
      expect(result).toEqual({ isFavorite: true });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user1', {
        favoriteDiscussionIds: ['disc1'],
      });
    });

    it('odebere diskuzi z oblíbených pokud tam je', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user1',
        favoriteDiscussionIds: ['disc1'],
      });
      mockUsersRepo.update.mockResolvedValue({
        id: 'user1',
        favoriteDiscussionIds: [],
      });
      const result = await service.toggleFavorite('disc1', 'user1');
      expect(result).toEqual({ isFavorite: false });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user1', {
        favoriteDiscussionIds: [],
      });
    });

    it('odebrání z oblíbených zároveň odepne ze sidebaru (cascade)', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user1',
        favoriteDiscussionIds: ['disc1'],
        pinnedDiscussionIds: ['disc1'],
      });
      const result = await service.toggleFavorite('disc1', 'user1');
      expect(result).toEqual({ isFavorite: false });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user1', {
        favoriteDiscussionIds: [],
        pinnedDiscussionIds: [],
      });
    });
  });

  describe('togglePin', () => {
    it('připne oblíbenou diskuzi', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user1',
        favoriteDiscussionIds: ['disc1'],
        pinnedDiscussionIds: [],
      });
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      const result = await service.togglePin('disc1', 'user1');
      expect(result).toEqual({ isPinned: true });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user1', {
        pinnedDiscussionIds: ['disc1'],
      });
    });

    it('ConflictException když diskuze není oblíbená', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user1',
        favoriteDiscussionIds: [],
        pinnedDiscussionIds: [],
      });
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      await expect(service.togglePin('disc1', 'user1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('ConflictException při překročení limitu 5', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user1',
        favoriteDiscussionIds: ['disc1', 'a', 'b', 'c', 'd', 'e'],
        pinnedDiscussionIds: ['a', 'b', 'c', 'd', 'e'],
      });
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      await expect(service.togglePin('disc1', 'user1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('addPost', () => {
    it('hodí BadRequestException pokud diskuze není schválena', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion); // isApproved: false
      await expect(
        service.addPost('disc1', 'Obsah', 'user2', 'Autor'),
      ).rejects.toThrow(BadRequestException);
    });

    it('vytvoří příspěvek a atomicky inkrementuje postCount', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isApproved: true,
      });
      mockPostsRepo.create.mockResolvedValue(mockPost);
      const result = await service.addPost('disc1', 'Obsah', 'user2', 'Autor');
      expect(mockPostsRepo.create).toHaveBeenCalled();
      expect(mockRepo.adjustPostCount).toHaveBeenCalledWith('disc1', 1, true);
      expect(result).toEqual(mockPost);
    });
  });

  describe('deletePost', () => {
    it('autor smí smazat vlastní příspěvek', async () => {
      mockPostsRepo.findById.mockResolvedValue(mockPost);
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isApproved: true,
      });
      mockPostsRepo.delete.mockResolvedValue(true);
      mockRepo.update.mockResolvedValue({ ...mockDiscussion, postCount: 0 });
      await expect(
        service.deletePost('disc1', 'post1', 'user2', UserRole.Hrac, 'Autor'),
      ).resolves.toBeUndefined();
    });

    it('manager smí smazat cizí příspěvek', async () => {
      mockPostsRepo.findById.mockResolvedValue(mockPost);
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isApproved: true,
        managerIds: ['manager1'],
      });
      mockPostsRepo.delete.mockResolvedValue(true);
      mockRepo.update.mockResolvedValue({ ...mockDiscussion, postCount: 0 });
      await expect(
        service.deletePost(
          'disc1',
          'post1',
          'manager1',
          UserRole.Hrac,
          'Manager',
        ),
      ).resolves.toBeUndefined();
    });

    it('cizí uživatel bez práv nesmí smazat příspěvek', async () => {
      mockPostsRepo.findById.mockResolvedValue(mockPost);
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isApproved: true,
      });
      await expect(
        service.deletePost('disc1', 'post1', 'jiny', UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('toggleLike', () => {
    it('přidá like a inkrementuje likeCount', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user1',
        likedDiscussionIds: [],
      });
      mockRepo.adjustLikeCount.mockResolvedValue({
        ...mockDiscussion,
        likeCount: 1,
      });
      const result = await service.toggleLike('disc1', 'user1');
      expect(result).toEqual({ isLiked: true, likeCount: 1 });
      expect(mockRepo.adjustLikeCount).toHaveBeenCalledWith('disc1', 1);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user1', {
        likedDiscussionIds: ['disc1'],
      });
    });

    it('odebere like a dekrementuje likeCount', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        likeCount: 1,
      });
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user1',
        likedDiscussionIds: ['disc1'],
      });
      mockRepo.adjustLikeCount.mockResolvedValue({
        ...mockDiscussion,
        likeCount: 0,
      });
      const result = await service.toggleLike('disc1', 'user1');
      expect(result).toEqual({ isLiked: false, likeCount: 0 });
      expect(mockRepo.adjustLikeCount).toHaveBeenCalledWith('disc1', -1);
    });
  });

  describe('addManager / removeManager', () => {
    it('tvůrce přidá správce a notifikuje ho', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      mockRepo.update.mockResolvedValue({
        ...mockDiscussion,
        managerIds: ['user1', 'user2'],
      });
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user2',
        username: 'Nový',
      });
      await service.addManager(
        'disc1',
        'user2',
        'user1',
        UserRole.Hrac,
        'Tvůrce',
      );
      expect(mockRepo.update).toHaveBeenCalledWith('disc1', {
        managerIds: ['user1', 'user2'],
      });
      expect(mockMsgService.create).toHaveBeenCalled();
    });

    it('cizí uživatel nesmí přidat správce', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      await expect(
        service.addManager('disc1', 'user2', 'jiny', UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('tvůrce diskuze nelze odebrat ze správců', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      await expect(
        service.removeManager(
          'disc1',
          'user1',
          'user1',
          UserRole.Hrac,
          'Tvůrce',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestJoin', () => {
    it('hodí BadRequestException pro otevřenou diskuzi', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockDiscussion, isOpen: true });
      await expect(
        service.requestJoin('disc1', 'user9', 'Žadatel'),
      ).rejects.toThrow(BadRequestException);
    });

    it('přidá žadatele do joinRequestIds u uzamčené diskuze', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isOpen: false,
        creatorId: 'other',
        managerIds: ['other'],
      });
      mockRepo.update.mockResolvedValue({
        ...mockDiscussion,
        joinRequestIds: ['user9'],
      });
      mockUsersRepo.findById.mockResolvedValue({
        id: 'other',
        username: 'Manažer',
      });
      await service.requestJoin('disc1', 'user9', 'Žadatel');
      expect(mockRepo.update).toHaveBeenCalledWith('disc1', {
        joinRequestIds: ['user9'],
      });
    });

    it('no-op když žadatel už má přístup', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isOpen: false,
        invitedUserIds: ['user9'],
      });
      await service.requestJoin('disc1', 'user9', 'Žadatel');
      expect(mockRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('resolveJoinRequest', () => {
    it('accept přesune žadatele do invitedUserIds', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isOpen: false,
        joinRequestIds: ['user9'],
      });
      mockRepo.update.mockResolvedValue(mockDiscussion);
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user9',
        username: 'Žadatel',
      });
      await service.resolveJoinRequest(
        'disc1',
        'user9',
        true,
        'user1',
        UserRole.Hrac,
        'Tvůrce',
      );
      expect(mockRepo.update).toHaveBeenCalledWith('disc1', {
        joinRequestIds: [],
        invitedUserIds: ['user9'],
      });
    });

    it('reject jen odebere z joinRequestIds', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isOpen: false,
        joinRequestIds: ['user9'],
      });
      mockRepo.update.mockResolvedValue(mockDiscussion);
      mockUsersRepo.findById.mockResolvedValue({
        id: 'user9',
        username: 'Žadatel',
      });
      await service.resolveJoinRequest(
        'disc1',
        'user9',
        false,
        'user1',
        UserRole.Hrac,
        'Tvůrce',
      );
      expect(mockRepo.update).toHaveBeenCalledWith('disc1', {
        joinRequestIds: [],
      });
    });
  });

  describe('reportPost / resolveReport', () => {
    it('vytvoří report se snapshotem obsahu příspěvku', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      mockPostsRepo.findById.mockResolvedValue(mockPost);
      mockReportsRepo.create.mockResolvedValue({ id: 'rep1' });
      mockUsersRepo.findByRoles.mockResolvedValue([]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.reportPost('disc1', 'post1', 'Spam', 'user5', 'Reportér');
      expect(mockReportsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          postContentSnapshot: 'Obsah příspěvku',
          postAuthorName: 'Autor',
          reason: 'Spam',
        }),
      );
    });

    it('resolveReport s deletePost smaže příspěvek a uzavře report', async () => {
      mockReportsRepo.findById.mockResolvedValue({
        id: 'rep1',
        postId: 'post1',
        discussionId: 'disc1',
      });
      mockPostsRepo.findById.mockResolvedValue(mockPost);
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        postCount: 3,
      });
      await service.resolveReport('rep1', true, UserRole.Admin, 'Admin');
      expect(mockPostsRepo.delete).toHaveBeenCalledWith('post1');
      expect(mockReportsRepo.markResolved).toHaveBeenCalledWith('rep1');
    });

    it('resolveReport hodí ForbiddenException pro non-admina', async () => {
      await expect(
        service.resolveReport('rep1', false, UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMembers', () => {
    it('manažer vidí resolvované seznamy členů', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        invitedUserIds: ['u2'],
        joinRequestIds: ['u3'],
      });
      mockUsersRepo.findById.mockImplementation((uid: string) =>
        Promise.resolve({ id: uid, username: `jméno-${uid}` }),
      );
      const result = await service.getMembers(
        'disc1',
        'user1',
        UserRole.Hrac,
        'Tvůrce',
      );
      expect(result.managers).toEqual([
        { id: 'user1', username: 'jméno-user1' },
      ]);
      expect(result.invited).toEqual([{ id: 'u2', username: 'jméno-u2' }]);
      expect(result.joinRequests).toEqual([{ id: 'u3', username: 'jméno-u3' }]);
    });

    it('cizí uživatel nemá přístup k členům', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      await expect(
        service.getMembers('disc1', 'jiny', UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // D-040 — tombstone enrichment v findAll / findById / getPosts.
  describe('D-040 tombstone enrichment', () => {
    it('findAll → creatoři jsou enrichnuti', async () => {
      mockRepo.findAll.mockResolvedValue([
        { ...mockDiscussion, id: 'd1', creatorId: 'user1', isApproved: true },
      ]);
      mockUsersService.findManyTombstoneInfo.mockResolvedValueOnce(
        new Map([['user1', { isDeleted: true, displayName: 'Smazaný účet' }]]),
      );
      const result = await service.findAll('user2', UserRole.Hrac, 'pepa');
      expect(result[0].creatorIsDeleted).toBe(true);
    });

    it('getPosts → autoři postů jsou enrichnuti', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isApproved: true,
      });
      mockPostsRepo.findByDiscussion.mockResolvedValue([
        { ...mockPost, authorId: 'userGhost' },
      ]);
      mockUsersService.findManyTombstoneInfo.mockResolvedValueOnce(
        new Map([
          ['userGhost', { isDeleted: true, displayName: 'Smazaný účet' }],
        ]),
      );
      const result = await service.getPosts(
        'disc1',
        'user2',
        UserRole.Hrac,
        'pepa',
      );
      expect(result[0].authorIsDeleted).toBe(true);
    });
  });
});
