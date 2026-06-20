import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockItem = {
  id: 'gal1',
  title: 'Test obrázek',
  imageUrl: 'https://res.cloudinary.com/test/image/upload/test.jpg',
  publicId: 'gallery/test',
  width: 800,
  height: 600,
  category: 'fanart',
  authorId: 'user1',
  authorName: 'Autor',
  status: 'Draft' as const,
  ratings: [],
  averageRating: 0,
  createdAtUtc: new Date(),
  updatedAtUtc: new Date(),
};

describe('IkarosGalleryService', () => {
  let service: IkarosGalleryService;
  const mockRepo = {
    findPublished: jest.fn(),
    findPublishedAndPending: jest.fn(),
    findPending: jest.fn(),
    findByAuthor: jest.fn(),
    findByIds: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsertRating: jest.fn(),
    delete: jest.fn(),
    countByAuthorAndStatus: jest.fn(),
    countByCategory: jest.fn(),
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
  const mockUploadService = {
    uploadGalleryImage: jest.fn(),
    deleteImage: jest.fn(),
  };
  const mockCategoriesService = { existsByKey: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCategoriesService.existsByKey.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        IkarosGalleryService,
        { provide: 'IIkarosGalleryRepository', useValue: mockRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: UsersService, useValue: mockUsersService },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
        { provide: 'UploadService', useValue: mockUploadService },
        {
          provide: 'GalleryCategoriesService',
          useValue: mockCategoriesService,
        },
      ],
    }).compile();
    service = module.get(IkarosGalleryService);
  });

  describe('isAdmin', () => {
    it('SpravceGalerie je admin', () =>
      expect(service.isAdmin(UserRole.SpravceGalerie, 'nekdo')).toBe(true));
    it('PJ NENÍ admin (galerie = platformový obsah, PJ je world-scoped)', () =>
      expect(service.isAdmin(UserRole.PJ, 'nekdo')).toBe(false));
    // R-RUN-03 (plný audit 2026-06-20) — username backdoor odstraněn.
    it('Superadmin je admin', () =>
      expect(service.isAdmin(UserRole.Superadmin, 'kdokoli')).toBe(true));
    it('Hráč přejmenovaný na „Tyky" NENÍ admin (backdoor odstraněn)', () =>
      expect(service.isAdmin(UserRole.Hrac, 'Tyky')).toBe(false));
    it('Hráč není admin', () =>
      expect(service.isAdmin(UserRole.Hrac, 'nekdo')).toBe(false));
    it('anon (undefined role) není admin', () =>
      expect(service.isAdmin(undefined, undefined)).toBe(false));
  });

  describe('create', () => {
    const fakeFile = {
      buffer: Buffer.from(''),
      mimetype: 'image/jpeg',
      originalname: 'test.jpg',
    } as Express.Multer.File;

    beforeEach(() => {
      mockUploadService.uploadGalleryImage.mockResolvedValue({
        url: 'https://cloudinary.com/img.jpg',
        publicId: 'gallery/abc',
        width: 1024,
        height: 768,
      });
    });

    it('vytvoří Draft po nahrání obrázku, uloží rozměry a kategorii', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      const result = await service.create(
        { title: 'Test', category: 'fanart', submit: false },
        fakeFile,
        'user1',
        'Autor',
        UserRole.Hrac,
      );
      expect(result.status).toBe('Draft');
      expect(mockUploadService.uploadGalleryImage).toHaveBeenCalledWith(
        fakeFile,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1024,
          height: 768,
          publicId: 'gallery/abc',
          category: 'fanart',
        }),
      );
    });

    it('bez kategorie použije výchozí ostatni', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await service.create(
        { title: 'Test', submit: false },
        fakeFile,
        'user1',
        'Autor',
        UserRole.Hrac,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'ostatni' }),
      );
    });

    it('hodí BadRequest pro neexistující kategorii', async () => {
      mockCategoriesService.existsByKey.mockResolvedValue(false);
      await expect(
        service.create(
          { title: 'Test', category: 'neexistuje', submit: false },
          fakeFile,
          'user1',
          'Autor',
          UserRole.Hrac,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('vytvoří Pending s submit=true a pošle notifikaci', async () => {
      mockRepo.create.mockResolvedValue({ ...mockItem, status: 'Pending' });
      mockUsersRepo.findByRoles.mockResolvedValue([
        { id: 'admin1', username: 'Admin' },
      ]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.create(
        { title: 'Test', submit: true },
        fakeFile,
        'user1',
        'Autor',
        UserRole.Hrac,
      );
      expect(mockMsgService.create).toHaveBeenCalled();
    });
  });

  describe('findAll — anon read', () => {
    it('anon vidí jen Published', async () => {
      mockRepo.findPublished.mockResolvedValue([]);
      await service.findAll(undefined, undefined);
      expect(mockRepo.findPublished).toHaveBeenCalled();
      expect(mockRepo.findPublishedAndPending).not.toHaveBeenCalled();
    });
    it('admin vidí Published + Pending', async () => {
      mockRepo.findPublishedAndPending.mockResolvedValue([]);
      await service.findAll(UserRole.Admin, 'admin');
      expect(mockRepo.findPublishedAndPending).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('Pending → Published, pošle notifikaci autorovi', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockItem, status: 'Pending' });
      mockRepo.update.mockResolvedValue({ ...mockItem, status: 'Published' });
      await service.approve('gal1', UserRole.Admin, 'admin');
      expect(mockRepo.update).toHaveBeenCalledWith(
        'gal1',
        expect.objectContaining({
          status: 'Published',
          publishedAtUtc: expect.any(Date),
        }),
      );
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Obrázek schválen',
          recipientId: 'user1',
        }),
        expect.anything(),
      );
    });

    it('hodí ForbiddenException pro non-admina', async () => {
      await expect(
        service.approve('gal1', UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('PJ nesmí schvalovat (platformový obsah)', async () => {
      await expect(service.approve('gal1', UserRole.PJ, 'pj')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('reject', () => {
    it('Pending → Rejected s důvodem v notifikaci', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockItem, status: 'Pending' });
      mockRepo.update.mockResolvedValue({ ...mockItem, status: 'Rejected' });
      await service.reject(
        'gal1',
        'Nevhodný obsah obrázku',
        UserRole.Admin,
        'admin',
      );
      expect(mockRepo.update).toHaveBeenCalledWith(
        'gal1',
        expect.objectContaining({
          status: 'Rejected',
          rejectReason: 'Nevhodný obsah obrázku',
        }),
      );
    });
  });

  describe('delete', () => {
    it('autor smí smazat a uvolní Cloudinary asset', async () => {
      mockRepo.findById.mockResolvedValue(mockItem);
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('gal1', 'user1', UserRole.Hrac, 'autor');
      expect(mockUploadService.deleteImage).toHaveBeenCalledWith(
        'gallery/test',
      );
    });

    it('cizí uživatel bez admin práv nesmí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockItem);
      await expect(
        service.delete('gal1', 'jiny', UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findStats', () => {
    it('agreguje počty statusů a hodnocení autora', async () => {
      mockRepo.countByAuthorAndStatus.mockResolvedValue({
        Draft: 2,
        Pending: 1,
        Published: 3,
        Rejected: 0,
      });
      mockRepo.findByAuthor.mockResolvedValue([
        {
          ...mockItem,
          status: 'Published',
          ratings: [{ userId: 'a', stars: 4 }],
          averageRating: 4,
        },
        {
          ...mockItem,
          status: 'Published',
          ratings: [{ userId: 'b', stars: 2 }],
          averageRating: 2,
        },
        { ...mockItem, status: 'Draft', ratings: [], averageRating: 0 },
      ]);
      const stats = await service.findStats('user1');
      expect(stats.published).toBe(3);
      expect(stats.totalRatings).toBe(2);
      expect(stats.averageRating).toBe(3);
    });
  });

  // ─── 3.7 — oblíbené + připnutí ───────────────────────────────────────────

  describe('toggleFavorite', () => {
    it('přidá obrázek do oblíbených', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteGalleryIds: [],
        pinnedGalleryIds: [],
      });
      mockRepo.findById.mockResolvedValue(mockItem);
      const res = await service.toggleFavorite('gal1', 'u1');
      expect(res).toEqual({ isFavorite: true });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', {
        favoriteGalleryIds: ['gal1'],
      });
    });

    it('odebrání z oblíbených zároveň odepne (cascade)', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteGalleryIds: ['gal1'],
        pinnedGalleryIds: ['gal1'],
      });
      mockRepo.findById.mockResolvedValue(mockItem);
      const res = await service.toggleFavorite('gal1', 'u1');
      expect(res).toEqual({ isFavorite: false });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', {
        favoriteGalleryIds: [],
        pinnedGalleryIds: [],
      });
    });

    it('404 na neexistující obrázek', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteGalleryIds: [],
        pinnedGalleryIds: [],
      });
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.toggleFavorite('xx', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('togglePin', () => {
    it('připne oblíbený obrázek', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteGalleryIds: ['gal1'],
        pinnedGalleryIds: [],
      });
      mockRepo.findById.mockResolvedValue(mockItem);
      const res = await service.togglePin('gal1', 'u1');
      expect(res).toEqual({ isPinned: true });
    });

    it('ConflictException když obrázek není oblíbený', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteGalleryIds: [],
        pinnedGalleryIds: [],
      });
      mockRepo.findById.mockResolvedValue(mockItem);
      await expect(service.togglePin('gal1', 'u1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('ConflictException při překročení limitu 5', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteGalleryIds: ['gal1', 'a', 'b', 'c', 'd', 'e'],
        pinnedGalleryIds: ['a', 'b', 'c', 'd', 'e'],
      });
      mockRepo.findById.mockResolvedValue(mockItem);
      await expect(service.togglePin('gal1', 'u1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findMyFavorites', () => {
    it('vrací obrázky dle favoriteGalleryIds', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteGalleryIds: ['gal1'],
      });
      mockRepo.findByIds.mockResolvedValue([mockItem]);
      // D-040 — enrichment doplní authorIsDeleted: false (default).
      expect(await service.findMyFavorites('u1')).toEqual([
        { ...mockItem, authorIsDeleted: false },
      ]);
    });

    it('prázdné pole → []', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        favoriteGalleryIds: [],
      });
      expect(await service.findMyFavorites('u1')).toEqual([]);
    });
  });

  // D-040 — tombstone enrichment v findAll / findById.
  describe('D-040 tombstone enrichment', () => {
    it('findAll → autoři gallery items jsou enrichnuti', async () => {
      mockRepo.findPublished.mockResolvedValue([
        { ...mockItem, id: 'g1', authorId: 'userGhost' },
      ]);
      mockUsersService.findManyTombstoneInfo.mockResolvedValueOnce(
        new Map([
          ['userGhost', { isDeleted: true, displayName: 'Smazaný účet' }],
        ]),
      );
      const result = await service.findAll();
      expect(result[0].authorIsDeleted).toBe(true);
    });

    it('findById → single item enrichnut', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockItem,
        status: 'Published',
        authorId: 'userGhost',
      });
      mockUsersService.findManyTombstoneInfo.mockResolvedValueOnce(
        new Map([
          ['userGhost', { isDeleted: true, displayName: 'Smazaný účet' }],
        ]),
      );
      const result = await service.findById('gal1');
      expect(result.authorIsDeleted).toBe(true);
    });
  });
});
