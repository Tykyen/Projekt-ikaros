import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { GalleryCategoriesService } from './gallery-categories.service';

const mockCat = {
  key: 'fanart',
  label: 'Fanart',
  color: '#f06292',
  order: 0,
  createdAtUtc: new Date(),
};

describe('GalleryCategoriesService', () => {
  let service: GalleryCategoriesService;
  const mockRepo = {
    findAll: jest.fn(),
    findByKey: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockGalleryRepo = { countByCategory: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        GalleryCategoriesService,
        { provide: 'IGalleryCategoriesRepository', useValue: mockRepo },
        { provide: 'IIkarosGalleryRepository', useValue: mockGalleryRepo },
      ],
    }).compile();
    service = module.get(GalleryCategoriesService);
  });

  describe('existsByKey', () => {
    it('true pokud kategorie existuje', async () => {
      mockRepo.findByKey.mockResolvedValue(mockCat);
      expect(await service.existsByKey('fanart')).toBe(true);
    });
    it('false pokud neexistuje', async () => {
      mockRepo.findByKey.mockResolvedValue(null);
      expect(await service.existsByKey('xxx')).toBe(false);
    });
  });

  describe('create', () => {
    it('hodí Conflict pro duplicitní klíč', async () => {
      mockRepo.findByKey.mockResolvedValue(mockCat);
      await expect(
        service.create({
          key: 'fanart',
          label: 'X',
          color: '#000000',
          order: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('hodí Conflict pokud kategorii používají obrázky', async () => {
      mockRepo.findByKey.mockResolvedValue(mockCat);
      mockGalleryRepo.countByCategory.mockResolvedValue(3);
      await expect(service.delete('fanart')).rejects.toThrow(ConflictException);
    });
    it('smaže nepoužitou kategorii', async () => {
      mockRepo.findByKey.mockResolvedValue(mockCat);
      mockGalleryRepo.countByCategory.mockResolvedValue(0);
      await service.delete('fanart');
      expect(mockRepo.delete).toHaveBeenCalledWith('fanart');
    });
    it('hodí NotFound pro neexistující kategorii', async () => {
      mockRepo.findByKey.mockResolvedValue(null);
      await expect(service.delete('xxx')).rejects.toThrow(NotFoundException);
    });
  });
});
