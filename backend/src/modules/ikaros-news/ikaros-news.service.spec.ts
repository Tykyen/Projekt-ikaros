import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IkarosNewsService } from './ikaros-news.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { IkarosNewsItem } from './interfaces/ikaros-news.interface';

const mockItem: IkarosNewsItem = {
  id: 'news1',
  title: 'Novinka',
  content: 'Obsah novinky',
  authorId: 'user1',
  authorName: 'Admin',
  createdAtUtc: new Date('2026-05-04'),
  isActive: true,
};

describe('IkarosNewsService', () => {
  let service: IkarosNewsService;
  const mockRepo = {
    findActive: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosNewsService,
        { provide: 'IIkarosNewsRepository', useValue: mockRepo },
      ],
    }).compile();
    service = module.get(IkarosNewsService);
  });

  describe('findAll', () => {
    it('vrátí aktivní novinky', async () => {
      mockRepo.findActive.mockResolvedValue([mockItem]);
      const result = await service.findAll();
      expect(result).toEqual([mockItem]);
    });
  });

  describe('create', () => {
    it('Superadmin smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      const result = await service.create(
        { title: 'Novinka', content: 'Obsah' },
        'user1',
        'Admin',
        UserRole.Superadmin,
      );
      expect(result).toEqual(mockItem);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 'user1',
          authorName: 'Admin',
          isActive: true,
        }),
      );
    });

    it('Admin smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'u1', 'A', UserRole.Admin),
      ).resolves.toBeDefined();
    });

    it('PJ smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'u1', 'A', UserRole.PJ),
      ).resolves.toBeDefined();
    });

    it('Hráč nesmí vytvořit novinku', async () => {
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'u1', 'A', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Korektor nesmí vytvořit novinku', async () => {
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'u1', 'A', UserRole.Korektor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('PJ smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('news1', UserRole.PJ)).resolves.toBeUndefined();
    });

    it('Admin smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('news1', UserRole.Admin)).resolves.toBeUndefined();
    });

    it('Superadmin smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('news1', UserRole.Superadmin)).resolves.toBeUndefined();
    });

    it('hodí NotFoundException pokud novinka neexistuje', async () => {
      mockRepo.delete.mockResolvedValue(false);
      await expect(service.delete('x', UserRole.Admin)).rejects.toThrow(NotFoundException);
    });

    it('Hráč nesmí smazat novinku', async () => {
      await expect(service.delete('news1', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });
  });
});
