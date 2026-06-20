import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
};

const mockUser = (id: string, username: string) => ({
  id,
  username,
  role: UserRole.Admin,
});

describe('IkarosNewsService', () => {
  let service: IkarosNewsService;
  const mockRepo = {
    findByScope: jest.fn(),
    countByScope: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setArchived: jest.fn(),
    delete: jest.fn(),
  };
  const mockUsersRepo = {
    findById: jest.fn(),
  };
  const mockAuditRepo = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const mockEmitter = { emit: jest.fn() };

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
        { provide: 'IAdminAuditLogRepository', useValue: mockAuditRepo },
        // C-47 — service emituje 'ikaros-news.changed' po mutaci.
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();
    service = module.get(IkarosNewsService);
  });

  describe('findAll', () => {
    it('vrátí aktivní novinky s authorName joinned z UsersRepo', async () => {
      mockRepo.findByScope.mockResolvedValue([mockItem]);
      const result = await service.findAll();
      expect(result[0]).toMatchObject({
        id: 'news1',
        authorId: 'user1',
        authorName: 'AdminUser',
      });
    });

    it('fallback na legacy authorName z DB pro smazaného uživatele', async () => {
      mockRepo.findByScope.mockResolvedValue([
        { ...mockItem, authorName: 'StaryAdmin' },
      ]);
      mockUsersRepo.findById.mockResolvedValue(null);
      const result = await service.findAll();
      expect(result[0].authorName).toBe('StaryAdmin');
    });

    it('prázdný authorName pokud user neexistuje a žádný legacy snapshot', async () => {
      mockRepo.findByScope.mockResolvedValue([mockItem]);
      mockUsersRepo.findById.mockResolvedValue(null);
      const result = await service.findAll();
      expect(result[0].authorName).toBe('');
    });

    it('deduplikuje lookup pro stejné authorId', async () => {
      mockRepo.findByScope.mockResolvedValue([
        mockItem,
        { ...mockItem, id: 'news2' },
        { ...mockItem, id: 'news3' },
      ]);
      await service.findAll();
      expect(mockUsersRepo.findById).toHaveBeenCalledTimes(1);
    });

    it('D-068 — propaguje limit/offset do repo', async () => {
      mockRepo.findByScope.mockResolvedValue([]);
      await service.findAll({ limit: 5, offset: 10 });
      expect(mockRepo.findByScope).toHaveBeenCalledWith({
        limit: 5,
        offset: 10,
      });
    });

    it('Spec 3.1 — propaguje scope do repo', async () => {
      mockRepo.findByScope.mockResolvedValue([]);
      await service.findAll({ scope: 'archived', limit: 20, offset: 0 });
      expect(mockRepo.findByScope).toHaveBeenCalledWith({
        scope: 'archived',
        limit: 20,
        offset: 0,
      });
    });
  });

  describe('count / countActive', () => {
    it('D-068 — countActive (legacy alias) volá countByScope("active")', async () => {
      mockRepo.countByScope.mockResolvedValue(42);
      await expect(service.countActive()).resolves.toBe(42);
      expect(mockRepo.countByScope).toHaveBeenCalledWith('active');
    });

    it('Spec 3.1 — count propaguje scope do repo', async () => {
      mockRepo.countByScope.mockResolvedValue(7);
      await expect(service.count('archived')).resolves.toBe(7);
      expect(mockRepo.countByScope).toHaveBeenCalledWith('archived');
    });

    it('Spec 3.1 — count bez argumentu = active (BC default)', async () => {
      mockRepo.countByScope.mockResolvedValue(3);
      await service.count();
      expect(mockRepo.countByScope).toHaveBeenCalledWith('active');
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
          archived: false,
        }),
      );
      // authorName se NESMÍ ukládat do DB (drop denormalizace)
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ authorName: expect.any(String) }),
      );
      // D-065 — isActive už neukládáme
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ isActive: expect.anything() }),
      );
    });

    it('Admin smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'user1', UserRole.Admin),
      ).resolves.toBeDefined();
    });

    it('F-10 — content se sanitizuje (<script> se zahodí) před uložením', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await service.create(
        {
          title: 'X',
          content: '<p>ahoj</p><script>alert(1)</script>',
        },
        'user1',
        UserRole.Admin,
      );
      const savedContent = (
        mockRepo.create.mock.calls[0][0] as { content: string }
      ).content;
      expect(savedContent).not.toContain('<script');
      expect(savedContent).toContain('<p>ahoj</p>');
    });

    it('D-069 — PJ NESMÍ vytvořit novinku (platform obsah jen pro globální role)', async () => {
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'user1', UserRole.PJ),
      ).rejects.toThrow(ForbiddenException);
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
    it('D-069 — PJ NESMÍ smazat novinku (platform obsah jen pro globální role)', async () => {
      await expect(
        service.delete('news1', 'user1', UserRole.PJ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Admin smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('news1', 'user1', UserRole.Admin),
      ).resolves.toBeUndefined();
    });

    it('Superadmin smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('news1', 'user1', UserRole.Superadmin),
      ).resolves.toBeUndefined();
    });

    it('hodí NotFoundException pokud novinka neexistuje', async () => {
      mockRepo.delete.mockResolvedValue(false);
      await expect(
        service.delete('x', 'user1', UserRole.Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('D-067 — smazání loguje audit záznam (targetType ikaros-news)', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'news1',
        title: 'Testovací novinka',
        archived: false,
      });
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('news1', 'user1', UserRole.Admin);
      expect(mockAuditRepo.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'IKAROS_NEWS_DELETE',
          targetType: 'ikaros-news',
          targetId: 'news1',
        }),
      );
    });

    it('Hráč nesmí smazat novinku', async () => {
      await expect(
        service.delete('news1', 'user1', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    // CD-RUN-4 — úklid blobu obrázku smazané novinky (hard delete).
    it('CD-RUN-4 — smazání novinky s obrázkem emituje media.orphaned', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'news1',
        title: 'S obrázkem',
        imageUrl: 'https://cdn/news.jpg',
      });
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('news1', 'user1', UserRole.Admin);
      expect(mockEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: ['https://cdn/news.jpg'],
      });
    });

    it('CD-RUN-4 — novinka bez obrázku neemituje media.orphaned', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'news1', title: 'Bez' });
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('news1', 'user1', UserRole.Admin);
      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        'media.orphaned',
        expect.anything(),
      );
    });
  });

  describe('update (Spec 3.1)', () => {
    it('Admin smí update', async () => {
      mockRepo.update.mockResolvedValue({ ...mockItem, title: 'New title' });
      const result = await service.update(
        'news1',
        { title: 'New title' },
        UserRole.Admin,
      );
      expect(result.title).toBe('New title');
      expect(mockRepo.update).toHaveBeenCalledWith('news1', {
        title: 'New title',
      });
    });

    it('Superadmin smí update', async () => {
      mockRepo.update.mockResolvedValue({ ...mockItem, content: 'New' });
      await expect(
        service.update('news1', { content: 'New' }, UserRole.Superadmin),
      ).resolves.toBeDefined();
    });

    it('PJ NESMÍ update (platform obsah)', async () => {
      await expect(
        service.update('news1', { title: 'X' }, UserRole.PJ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Hráč NESMÍ update', async () => {
      await expect(
        service.update('news1', { title: 'X' }, UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prázdný DTO → 400 BadRequest', async () => {
      await expect(service.update('news1', {}, UserRole.Admin)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('neexistující id → 404 NotFound', async () => {
      mockRepo.update.mockResolvedValue(null);
      await expect(
        service.update('missing', { title: 'X' }, UserRole.Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('F-10 — update content se sanitizuje (<script> se zahodí)', async () => {
      mockRepo.update.mockResolvedValue(mockItem);
      await service.update(
        'news1',
        { content: '<p>nove</p><script>evil()</script>' },
        UserRole.Admin,
      );
      const savedContent = (
        mockRepo.update.mock.calls[0][1] as { content: string }
      ).content;
      expect(savedContent).not.toContain('<script');
      expect(savedContent).toContain('<p>nove</p>');
    });

    it('předává jen poslané fieldy (partial update)', async () => {
      mockRepo.update.mockResolvedValue(mockItem);
      await service.update('news1', { title: 'A' }, UserRole.Admin);
      expect(mockRepo.update).toHaveBeenCalledWith('news1', { title: 'A' });
      expect(mockRepo.update).not.toHaveBeenCalledWith(
        'news1',
        expect.objectContaining({ content: expect.anything() }),
      );
    });
  });

  describe('archive (Spec 3.1)', () => {
    it('Admin archivuje novinku — repo dostane userId pro audit', async () => {
      mockRepo.setArchived.mockResolvedValue({ ...mockItem, archived: true });
      const result = await service.archive(
        'news1',
        'adminUserId',
        UserRole.Admin,
      );
      expect(result.archived).toBe(true);
      expect(mockRepo.setArchived).toHaveBeenCalledWith(
        'news1',
        true,
        'adminUserId',
      );
    });

    it('PJ NESMÍ archivovat', async () => {
      await expect(service.archive('news1', 'u', UserRole.PJ)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('idempotence — opakovaný archive na již archivované = no error', async () => {
      mockRepo.setArchived.mockResolvedValue({ ...mockItem, archived: true });
      await expect(
        service.archive('news1', 'u', UserRole.Admin),
      ).resolves.toBeDefined();
      // setArchived volaný 1× per call → idempotence řeší DB layer
      expect(mockRepo.setArchived).toHaveBeenCalledTimes(1);
    });

    it('neexistující id → 404', async () => {
      mockRepo.setArchived.mockResolvedValue(null);
      await expect(service.archive('x', 'u', UserRole.Admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('unarchive (Spec 3.1)', () => {
    it('Admin unarchive — repo dostane archived=false, žádný userId', async () => {
      mockRepo.setArchived.mockResolvedValue({ ...mockItem, archived: false });
      await service.unarchive('news1', 'user1', UserRole.Admin);
      expect(mockRepo.setArchived).toHaveBeenCalledWith('news1', false);
    });

    it('PJ NESMÍ unarchive', async () => {
      await expect(
        service.unarchive('news1', 'user1', UserRole.PJ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('neexistující id → 404', async () => {
      mockRepo.setArchived.mockResolvedValue(null);
      await expect(
        service.unarchive('x', 'user1', UserRole.Admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Spec 3.1b — type + imageUrl', () => {
    it('create propaguje type do repo', async () => {
      mockRepo.create.mockResolvedValue({ ...mockItem, type: 'warning' });
      await service.create(
        { title: 'X', content: 'Y', type: 'warning' },
        'user1',
        UserRole.Admin,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warning' }),
      );
    });

    it('create bez type → default info', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await service.create(
        { title: 'X', content: 'Y' },
        'user1',
        UserRole.Admin,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'info' }),
      );
    });

    it('create propaguje imageUrl do repo', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await service.create(
        { title: 'X', content: 'Y', imageUrl: 'https://cdn/n.png' },
        'user1',
        UserRole.Admin,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://cdn/n.png' }),
      );
    });

    it('response vždy obsahuje type (legacy fallback info)', async () => {
      mockRepo.findByScope.mockResolvedValue([mockItem]);
      const result = await service.findAll();
      expect(result[0].type).toBe('info');
    });

    it('update samotného type je povolen (ne prázdný DTO)', async () => {
      mockRepo.update.mockResolvedValue({ ...mockItem, type: 'system' });
      await service.update('news1', { type: 'system' }, UserRole.Admin);
      expect(mockRepo.update).toHaveBeenCalledWith('news1', { type: 'system' });
    });

    it('update imageUrl: null se propaguje (odebrání obrázku)', async () => {
      mockRepo.update.mockResolvedValue(mockItem);
      await service.update('news1', { imageUrl: null }, UserRole.Admin);
      expect(mockRepo.update).toHaveBeenCalledWith('news1', {
        imageUrl: null,
      });
    });
  });
});
