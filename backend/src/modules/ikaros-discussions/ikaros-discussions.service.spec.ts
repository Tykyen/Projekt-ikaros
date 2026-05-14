import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
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
    findPending: jest.fn(),
    findByIds: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockPostsRepo = {
    findByDiscussion: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteByDiscussion: jest.fn(),
  };
  const mockUsersRepo = {
    findByRoles: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
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
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
      ],
    }).compile();
    service = module.get(IkarosDiscussionsService);
  });

  describe('isAdmin', () => {
    it('SpravceDisukzi je admin', () =>
      expect(service.isAdmin(UserRole.SpravceDisukzi, 'nekdo')).toBe(true));
    it('Tyky je admin', () =>
      expect(service.isAdmin(UserRole.Hrac, 'Tyky')).toBe(true));
    it('Hráč není admin', () =>
      expect(service.isAdmin(UserRole.Hrac, 'nekdo')).toBe(false));
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
  });

  describe('addPost', () => {
    it('hodí BadRequestException pokud diskuze není schválena', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion); // isApproved: false
      await expect(
        service.addPost('disc1', 'Obsah', 'user2', 'Autor'),
      ).rejects.toThrow(BadRequestException);
    });

    it('vytvoří příspěvek a inkrementuje postCount', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockDiscussion,
        isApproved: true,
      });
      mockPostsRepo.create.mockResolvedValue(mockPost);
      mockRepo.update.mockResolvedValue({ ...mockDiscussion, postCount: 1 });
      const result = await service.addPost('disc1', 'Obsah', 'user2', 'Autor');
      expect(mockPostsRepo.create).toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith(
        'disc1',
        expect.objectContaining({ postCount: 1 }),
      );
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
});
