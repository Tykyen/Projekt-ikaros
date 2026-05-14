import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IkarosNewsService } from './ikaros-news.service';
import { PushService } from '../push/push.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { IkarosNewsItem } from './interfaces/ikaros-news.interface';

const mockItem: IkarosNewsItem = {
  id: 'news1',
  title: 'Novinka',
  content: 'Obsah novinky',
  authorId: 'user1',
  createdAtUtc: new Date('2026-05-04'),
  isActive: true,
};

const mockUser = (id: string, username: string) => ({
  id,
  username,
  role: UserRole.Admin,
});

describe('IkarosNewsService', () => {
  let service: IkarosNewsService;
  const mockRepo = {
    findActive: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const mockUsersRepo = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUsersRepo.findById.mockResolvedValue(mockUser('user1', 'AdminUser'));
    const module = await Test.createTestingModule({
      providers: [
        IkarosNewsService,
        { provide: 'IIkarosNewsRepository', useValue: mockRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        {
          provide: PushService,
          useValue: { notifyAll: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get(IkarosNewsService);
  });

  describe('findAll', () => {
    it('vrátí aktivní novinky s authorName joinned z UsersRepo', async () => {
      mockRepo.findActive.mockResolvedValue([mockItem]);
      const result = await service.findAll();
      expect(result[0]).toMatchObject({
        id: 'news1',
        authorId: 'user1',
        authorName: 'AdminUser',
      });
    });

    it('fallback na legacy authorName z DB pro smazaného uživatele', async () => {
      mockRepo.findActive.mockResolvedValue([
        { ...mockItem, authorName: 'StaryAdmin' },
      ]);
      mockUsersRepo.findById.mockResolvedValue(null);
      const result = await service.findAll();
      expect(result[0].authorName).toBe('StaryAdmin');
    });

    it('prázdný authorName pokud user neexistuje a žádný legacy snapshot', async () => {
      mockRepo.findActive.mockResolvedValue([mockItem]);
      mockUsersRepo.findById.mockResolvedValue(null);
      const result = await service.findAll();
      expect(result[0].authorName).toBe('');
    });

    it('deduplikuje lookup pro stejné authorId', async () => {
      mockRepo.findActive.mockResolvedValue([
        mockItem,
        { ...mockItem, id: 'news2' },
        { ...mockItem, id: 'news3' },
      ]);
      await service.findAll();
      expect(mockUsersRepo.findById).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    it('Superadmin smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      const result = await service.create(
        { title: 'Novinka', content: 'Obsah' },
        'user1',
        UserRole.Superadmin,
      );
      expect(result.authorName).toBe('AdminUser');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 'user1',
          isActive: true,
        }),
      );
      // authorName se NESMÍ ukládat do DB (drop denormalizace)
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ authorName: expect.any(String) }),
      );
    });

    it('Admin smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'user1', UserRole.Admin),
      ).resolves.toBeDefined();
    });

    it('PJ smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'user1', UserRole.PJ),
      ).resolves.toBeDefined();
    });

    it('Hráč nesmí vytvořit novinku', async () => {
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'user1', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Korektor nesmí vytvořit novinku', async () => {
      await expect(
        service.create(
          { title: 'X', content: 'Y' },
          'user1',
          UserRole.Korektor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('PJ smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('news1', UserRole.PJ),
      ).resolves.toBeUndefined();
    });

    it('Admin smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('news1', UserRole.Admin),
      ).resolves.toBeUndefined();
    });

    it('Superadmin smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('news1', UserRole.Superadmin),
      ).resolves.toBeUndefined();
    });

    it('hodí NotFoundException pokud novinka neexistuje', async () => {
      mockRepo.delete.mockResolvedValue(false);
      await expect(service.delete('x', UserRole.Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Hráč nesmí smazat novinku', async () => {
      await expect(service.delete('news1', UserRole.Hrac)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
