import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IkarosArticlesService } from './ikaros-articles.service';
import { IkarosCategoriesService } from '../ikaros-categories/ikaros-categories.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockArticle = {
  id: 'art1',
  title: 'Testovací článek',
  content: 'Obsah',
  category: 'Ostatni' as const,
  authorId: 'user1',
  authorName: 'Autor',
  status: 'Draft' as const,
  ratings: [],
  averageRating: 0,
  createdAtUtc: new Date(),
  updatedAtUtc: new Date(),
};

describe('IkarosArticlesService', () => {
  let service: IkarosArticlesService;
  const mockRepo = {
    findPublished: jest.fn(),
    findPublishedAndPending: jest.fn(),
    searchPublished: jest.fn(),
    searchPublishedAndPending: jest.fn(),
    findPending: jest.fn(),
    findByAuthor: jest.fn(),
    findByIds: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsertRating: jest.fn(),
    delete: jest.fn(),
    countByAuthorAndStatus: jest.fn(),
    // 3.2a — nové metody pro provider + mark-as-read
    findPendingPaginated: jest.fn(),
    countByStatus: jest.fn(),
    countByCategory: jest.fn(),
    findPublishedIds: jest.fn(),
  };
  const mockReadsRepo = {
    upsertRead: jest.fn(),
    isRead: jest.fn(),
    countReadByUserForArticleIds: jest.fn(),
  };
  const mockUsersRepo = {
    findByRoles: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  };
  // D-040 — tombstone batch enrich; default = všichni autoři aktivní (prázdná map).
  const mockUsersService = {
    findManyTombstoneInfo: jest.fn().mockResolvedValue(new Map()),
  };
  const mockMsgService = { create: jest.fn() };
  // 3.2a — kategorie validation — defaultně všechny existují
  const mockCategoriesService = {
    existsByKey: jest.fn().mockResolvedValue(true),
    findByKey: jest.fn(),
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCategoriesService.existsByKey.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        IkarosArticlesService,
        { provide: 'IIkarosArticlesRepository', useValue: mockRepo },
        { provide: 'IArticleReadsRepository', useValue: mockReadsRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: UsersService, useValue: mockUsersService },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
        // 3.2a — IkarosCategoriesService je injectovaná přes class token + forwardRef
        { provide: IkarosCategoriesService, useValue: mockCategoriesService },
      ],
    }).compile();
    service = module.get(IkarosArticlesService);
  });

  describe('isAdmin', () => {
    it('PJ NENÍ admin článků (N-14 — platformový obsah, PJ je world role)', () =>
      expect(service.isAdmin(UserRole.PJ, 'nekdo')).toBe(false));
    it('SpravceClanku je admin', () =>
      expect(service.isAdmin(UserRole.SpravceClanku, 'nekdo')).toBe(true));
    it('Tyky je admin bez ohledu na roli', () =>
      expect(service.isAdmin(UserRole.Hrac, 'Tyky')).toBe(true));
    it('Hráč není admin', () =>
      expect(service.isAdmin(UserRole.Hrac, 'nekdo')).toBe(false));
  });

  describe('create', () => {
    it('vytvoří Draft článek bez submit', async () => {
      mockRepo.create.mockResolvedValue(mockArticle);
      const result = await service.create(
        { title: 'X', content: 'Y' },
        'user1',
        'Autor',
        UserRole.Hrac,
      );
      expect(result.status).toBe('Draft');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Draft' }),
      );
    });

    it('vytvoří Pending článek s submit=true a pošle notifikaci', async () => {
      const pending = { ...mockArticle, status: 'Pending' as const };
      mockRepo.create.mockResolvedValue(pending);
      mockUsersRepo.findByRoles.mockResolvedValue([
        { id: 'admin1', username: 'Admin' },
      ]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.create(
        { title: 'X', content: 'Y', submit: true },
        'user1',
        'Autor',
        UserRole.Hrac,
      );
      expect(mockMsgService.create).toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('Draft → Pending, pošle notifikaci adminům', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      mockRepo.update.mockResolvedValue({ ...mockArticle, status: 'Pending' });
      mockUsersRepo.findByRoles.mockResolvedValue([
        { id: 'a1', username: 'Admin' },
      ]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.submit('art1', 'user1', UserRole.Hrac);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'art1',
        expect.objectContaining({ status: 'Pending' }),
      );
      expect(mockMsgService.create).toHaveBeenCalled();
    });

    it('hodí ForbiddenException pokud není autor', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(
        service.submit('art1', 'jiny', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hodí BadRequestException pokud status není Draft nebo Rejected', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockArticle,
        status: 'Published',
      });
      await expect(
        service.submit('art1', 'user1', UserRole.Hrac),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('Pending → Published, nastaví publishedAtUtc, pošle notifikaci autorovi', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockArticle,
        status: 'Pending',
      });
      mockRepo.update.mockResolvedValue({
        ...mockArticle,
        status: 'Published',
      });
      await service.approve('art1', UserRole.Admin, 'admin');
      expect(mockRepo.update).toHaveBeenCalledWith(
        'art1',
        expect.objectContaining({
          status: 'Published',
          publishedAtUtc: expect.any(Date),
        }),
      );
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Článek schválen',
          recipientId: 'user1',
        }),
        expect.anything(),
      );
    });

    it('hodí ForbiddenException pro non-admina', async () => {
      await expect(
        service.approve('art1', UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hodí BadRequestException pokud status není Pending', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(
        service.approve('art1', UserRole.Admin, 'admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('→ Rejected s důvodem, pošle notifikaci autorovi', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockArticle,
        status: 'Pending',
      });
      mockRepo.update.mockResolvedValue({ ...mockArticle, status: 'Rejected' });
      await service.reject('art1', 'Nevyhovuje', UserRole.Admin, 'admin');
      expect(mockRepo.update).toHaveBeenCalledWith('art1', {
        status: 'Rejected',
        rejectReason: 'Nevyhovuje',
        updatedAtUtc: expect.any(Date),
      });
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Článek zamítnut',
          recipientId: 'user1',
        }),
        expect.anything(),
      );
    });
  });

  describe('rate', () => {
    it('upsertuje hodnocení a vrátí averageRating + totalRatings', async () => {
      const rated = {
        ...mockArticle,
        ratings: [{ userId: 'user2', stars: 4 }],
        averageRating: 4,
      };
      mockRepo.findById.mockResolvedValue({
        ...mockArticle,
        status: 'Published',
      });
      mockRepo.upsertRating.mockResolvedValue(rated);
      const result = await service.rate('art1', 4, 'user2', UserRole.Hrac);
      expect(result).toEqual({ averageRating: 4, totalRatings: 1 });
    });

    it('hodí ForbiddenException pokud autor hodnotí vlastní článek', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockArticle,
        status: 'Published',
      });
      await expect(
        service.rate('art1', 5, 'user1', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hodí BadRequestException pokud článek není Published', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(
        service.rate('art1', 5, 'user2', UserRole.Hrac),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('autor smí smazat vlastní článek', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('art1', 'user1', UserRole.Hrac, 'autor'),
      ).resolves.toBeUndefined();
    });

    it('admin smí smazat cizí článek', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('art1', 'jiny', UserRole.Admin, 'admin'),
      ).resolves.toBeUndefined();
    });

    it('cizí uživatel bez admin práv nesmí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(
        service.delete('art1', 'jiny', UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── 3.7 — oblíbené + připnutí ───────────────────────────────────────────

  describe('toggleFavorite', () => {
    it('přidá článek do oblíbených', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: [],
        pinnedArticleIds: [],
      });
      mockRepo.findById.mockResolvedValue(mockArticle);
      const res = await service.toggleFavorite('art1', 'u1');
      expect(res).toEqual({ isFavorite: true });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', {
        favoriteArticleIds: ['art1'],
      });
    });

    it('odebrání z oblíbených zároveň odepne (cascade)', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: ['art1'],
        pinnedArticleIds: ['art1'],
      });
      mockRepo.findById.mockResolvedValue(mockArticle);
      const res = await service.toggleFavorite('art1', 'u1');
      expect(res).toEqual({ isFavorite: false });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', {
        favoriteArticleIds: [],
        pinnedArticleIds: [],
      });
    });

    it('404 na neexistující článek', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: [],
        pinnedArticleIds: [],
      });
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.toggleFavorite('xx', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('togglePin', () => {
    it('připne oblíbený článek', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: ['art1'],
        pinnedArticleIds: [],
      });
      mockRepo.findById.mockResolvedValue(mockArticle);
      const res = await service.togglePin('art1', 'u1');
      expect(res).toEqual({ isPinned: true });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', {
        pinnedArticleIds: ['art1'],
      });
    });

    it('ConflictException když článek není oblíbený', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: [],
        pinnedArticleIds: [],
      });
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(service.togglePin('art1', 'u1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('ConflictException při překročení limitu 5', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: ['art1', 'a', 'b', 'c', 'd', 'e'],
        pinnedArticleIds: ['a', 'b', 'c', 'd', 'e'],
      });
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(service.togglePin('art1', 'u1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('odepnutí již připnutého projde i na plném limitu', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: ['art1', 'a', 'b', 'c', 'd'],
        pinnedArticleIds: ['art1', 'a', 'b', 'c', 'd'],
      });
      mockRepo.findById.mockResolvedValue(mockArticle);
      const res = await service.togglePin('art1', 'u1');
      expect(res).toEqual({ isPinned: false });
    });
  });

  describe('findMyFavorites', () => {
    it('vrací články dle favoriteArticleIds', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: ['art1'],
      });
      mockRepo.findByIds.mockResolvedValue([mockArticle]);
      const res = await service.findMyFavorites('u1');
      // D-040 — enrichment doplní authorIsDeleted: false (default).
      expect(res).toEqual([{ ...mockArticle, authorIsDeleted: false }]);
    });

    it('prázdné pole → []', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteArticleIds: [],
      });
      expect(await service.findMyFavorites('u1')).toEqual([]);
    });
  });

  // D-040 — tombstone enrichment ve findAll / findById.
  describe('D-040 tombstone enrichment', () => {
    it('findAll → autoři jsou enrichnuti podle findManyTombstoneInfo', async () => {
      mockRepo.findPublished.mockResolvedValue([
        { ...mockArticle, id: 'a1', authorId: 'user1' },
        { ...mockArticle, id: 'a2', authorId: 'userGhost' },
      ]);
      mockUsersService.findManyTombstoneInfo.mockResolvedValueOnce(
        new Map([
          ['user1', { isDeleted: false, displayName: 'Autor' }],
          ['userGhost', { isDeleted: true, displayName: 'Smazaný účet' }],
        ]),
      );
      const result = await service.findAll(undefined, undefined);
      expect(result[0].authorIsDeleted).toBe(false);
      expect(result[1].authorIsDeleted).toBe(true);
    });

    it('findById → single article enrichnut', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockArticle,
        status: 'Published',
        authorId: 'userGhost',
      });
      mockUsersService.findManyTombstoneInfo.mockResolvedValueOnce(
        new Map([
          ['userGhost', { isDeleted: true, displayName: 'Smazaný účet' }],
        ]),
      );
      const result = await service.findById(
        'art1',
        undefined,
        undefined,
        undefined,
      );
      expect(result.authorIsDeleted).toBe(true);
    });
  });
});
