import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { IkarosArticlesService } from './ikaros-articles.service';
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
    findPending: jest.fn(),
    findByAuthor: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsertRating: jest.fn(),
    delete: jest.fn(),
    countByAuthorAndStatus: jest.fn(),
  };
  const mockUsersRepo = { findByRoles: jest.fn(), findByUsername: jest.fn() };
  const mockMsgService = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosArticlesService,
        { provide: 'IIkarosArticlesRepository', useValue: mockRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
      ],
    }).compile();
    service = module.get(IkarosArticlesService);
  });

  describe('isAdmin', () => {
    it('PJ je admin', () =>
      expect(service.isAdmin(UserRole.PJ, 'nekdo')).toBe(true));
    it('SpravceClankuu je admin', () =>
      expect(service.isAdmin(UserRole.SpravceClankuu, 'nekdo')).toBe(true));
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
});
