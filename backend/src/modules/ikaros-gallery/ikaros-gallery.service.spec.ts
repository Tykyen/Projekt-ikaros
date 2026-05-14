import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockItem = {
  id: 'gal1',
  title: 'Test obrázek',
  imageUrl: 'https://res.cloudinary.com/test/image/upload/test.jpg',
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
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsertRating: jest.fn(),
    delete: jest.fn(),
    countByAuthorAndStatus: jest.fn(),
  };
  const mockUsersRepo = { findByRoles: jest.fn(), findByUsername: jest.fn() };
  const mockMsgService = { create: jest.fn() };
  const mockUploadService = { uploadGalleryImage: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosGalleryService,
        { provide: 'IIkarosGalleryRepository', useValue: mockRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
        { provide: 'UploadService', useValue: mockUploadService },
      ],
    }).compile();
    service = module.get(IkarosGalleryService);
  });

  describe('isAdmin', () => {
    it('SpravceGalerie je admin', () =>
      expect(service.isAdmin(UserRole.SpravceGalerie, 'nekdo')).toBe(true));
    it('PJ je admin', () =>
      expect(service.isAdmin(UserRole.PJ, 'nekdo')).toBe(true));
    it('Tyky je admin', () =>
      expect(service.isAdmin(UserRole.Hrac, 'Tyky')).toBe(true));
    it('Hráč není admin', () =>
      expect(service.isAdmin(UserRole.Hrac, 'nekdo')).toBe(false));
  });

  describe('create', () => {
    it('vytvoří Draft po nahrání obrázku', async () => {
      mockUploadService.uploadGalleryImage.mockResolvedValue({
        url: 'https://cloudinary.com/img.jpg',
        publicId: 'gal/abc',
      });
      mockRepo.create.mockResolvedValue(mockItem);
      const fakeFile = {
        buffer: Buffer.from(''),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
      } as Express.Multer.File;
      const result = await service.create(
        { title: 'Test', submit: false },
        fakeFile,
        'user1',
        'Autor',
        UserRole.Hrac,
      );
      expect(result.status).toBe('Draft');
      expect(mockUploadService.uploadGalleryImage).toHaveBeenCalledWith(
        fakeFile,
      );
    });

    it('vytvoří Pending s submit=true a pošle notifikaci', async () => {
      const pending = { ...mockItem, status: 'Pending' as const };
      mockUploadService.uploadGalleryImage.mockResolvedValue({
        url: 'https://cloudinary.com/img.jpg',
        publicId: 'gal/abc',
      });
      mockRepo.create.mockResolvedValue(pending);
      mockUsersRepo.findByRoles.mockResolvedValue([
        { id: 'admin1', username: 'Admin' },
      ]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      const fakeFile = {
        buffer: Buffer.from(''),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
      } as Express.Multer.File;
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
  });

  describe('delete', () => {
    it('autor smí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockItem);
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('gal1', 'user1', UserRole.Hrac, 'autor'),
      ).resolves.toBeUndefined();
    });

    it('cizí uživatel bez admin práv nesmí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockItem);
      await expect(
        service.delete('gal1', 'jiny', UserRole.Hrac, 'nekdo'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
