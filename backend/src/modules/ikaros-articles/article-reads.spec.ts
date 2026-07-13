import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IkarosArticlesService } from './ikaros-articles.service';
import { IkarosCategoriesService } from '../ikaros-categories/ikaros-categories.service';
import { UsersService } from '../users/users.service';

const baseArticle = {
  id: 'a1',
  title: 'T',
  content: '<p>x</p>',
  category: 'povidky' as const,
  authorId: 'u-author',
  authorName: 'A',
  status: 'Published' as const,
  ratings: [],
  averageRating: 0,
  createdAtUtc: new Date(),
  updatedAtUtc: new Date(),
};

describe('IkarosArticlesService — 3.2a reads & anon', () => {
  let service: IkarosArticlesService;
  const mockRepo: Record<string, jest.Mock> = {
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
    // D-SEC-GAP-2026-07-11 — creation-flood cap; default pod stropem.
    countByAuthor: jest.fn().mockResolvedValue(0),
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
  const mockUsersRepo = { findByRoles: jest.fn(), findByUsername: jest.fn() };
  // D-040 — tombstone batch enrich; default = všichni autoři aktivní.
  const mockUsersService = {
    findManyTombstoneInfo: jest.fn().mockResolvedValue(new Map()),
  };
  const mockMsgService = { create: jest.fn() };
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
        { provide: IkarosCategoriesService, useValue: mockCategoriesService },
      ],
    }).compile();
    service = module.get(IkarosArticlesService);
  });

  describe('anon read', () => {
    it('findAll bez role → jen Published', async () => {
      mockRepo.findPublished.mockResolvedValue([baseArticle]);
      const result = await service.findAll(undefined, undefined);
      expect(result).toHaveLength(1);
      expect(mockRepo.findPublished).toHaveBeenCalled();
      expect(mockRepo.findPublishedAndPending).not.toHaveBeenCalled();
    });

    it('findById anon Published → vrátí', async () => {
      mockRepo.findById.mockResolvedValue(baseArticle);
      const result = await service.findById(
        'a1',
        undefined,
        undefined,
        undefined,
      );
      expect(result.id).toBe('a1');
    });

    it('findById anon Draft → ForbiddenException', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseArticle, status: 'Draft' });
      await expect(
        service.findById('a1', undefined, undefined, undefined),
      ).rejects.toThrow(/Přístup odepřen/);
    });
  });

  describe('category validation', () => {
    it('create s neexistujícím category → BadRequestException', async () => {
      mockCategoriesService.existsByKey.mockResolvedValue(false);
      await expect(
        service.create(
          { title: 'X', content: 'Y', category: 'neexistuje' },
          'u1',
          'Autor',
          5,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('create bez category → default ostatni', async () => {
      mockRepo.create.mockResolvedValue(baseArticle);
      await service.create({ title: 'X', content: 'Y' }, 'u1', 'Autor', 5);
      expect(mockCategoriesService.existsByKey).toHaveBeenCalledWith('ostatni');
    });
  });

  describe('mark-as-read', () => {
    it('markRead Published → upsert', async () => {
      mockRepo.findById.mockResolvedValue(baseArticle);
      await service.markRead('a1', 'u-reader');
      expect(mockReadsRepo.upsertRead).toHaveBeenCalledWith('u-reader', 'a1');
    });

    it('markRead Draft → BadRequestException', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseArticle, status: 'Draft' });
      await expect(service.markRead('a1', 'u-reader')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockReadsRepo.upsertRead).not.toHaveBeenCalled();
    });

    it('markRead neexistující článek → NotFoundException', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.markRead('a1', 'u-reader')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('isReadByUser → boolean z reads repo', async () => {
      mockReadsRepo.isRead.mockResolvedValue(true);
      expect(await service.isReadByUser('a1', 'u1')).toBe(true);
    });

    it('unreadCountForUser → published - read', async () => {
      mockRepo.findPublishedIds.mockResolvedValue(['a1', 'a2', 'a3']);
      mockReadsRepo.countReadByUserForArticleIds.mockResolvedValue(1);
      expect(await service.unreadCountForUser('u1')).toBe(2);
    });

    it('unreadCountForUser bez Published → 0', async () => {
      mockRepo.findPublishedIds.mockResolvedValue([]);
      expect(await service.unreadCountForUser('u1')).toBe(0);
      expect(mockReadsRepo.countReadByUserForArticleIds).not.toHaveBeenCalled();
    });
  });
});
