import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PagesService } from './pages.service';
import { TipTapExtractor } from './tiptap-extractor.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockPage = {
  id: 'page1', slug: 'hlavni-lokace', worldId: 'world1', type: 'Lokace',
  title: 'Hlavní lokace', content: '<p>text</p>', sections: [], galleryImages: [],
  videos: [], accessRequirements: [], order: 0,
  createdAt: new Date(), updatedAt: new Date(),
};

const mockMembership = { id: 'mem1', userId: 'user1', worldId: 'world1', role: WorldRole.Hrac, akj: 5, joinedAt: new Date() };

describe('PagesService', () => {
  let service: PagesService;
  const mockPagesRepo = {
    findById: jest.fn(),
    findBySlugAndWorld: jest.fn(),
    findByWorld: jest.fn(),
    existsBySlugAndWorld: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PagesService,
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: TipTapExtractor, useValue: { extract: jest.fn().mockReturnValue('plain text') } },
      ],
    }).compile();
    service = module.get(PagesService);
  });

  describe('findByWorld', () => {
    it('vrátí stránky světa bez filtrování přístupu', async () => {
      mockPagesRepo.findByWorld.mockResolvedValue([mockPage]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockPagesRepo.findByWorld).toHaveBeenCalledWith('world1', undefined);
    });
  });

  describe('findBySlug', () => {
    it('vyhodí NotFoundException pokud stránka neexistuje', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(null);
      await expect(service.findBySlug('neexistuje', 'world1', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('vrátí stránku bez accessRequirements pro každého', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(mockPage);
      const result = await service.findBySlug('hlavni-lokace', 'world1', 'user1');
      expect(result.id).toBe('page1');
    });

    it('vyhodí ForbiddenException pokud AKJ nestačí', async () => {
      const restricted = { ...mockPage, accessRequirements: [{ type: 'AKJ', value: '10' }] };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockMembership, akj: 5 });
      await expect(service.findBySlug('hlavni-lokace', 'world1', 'user1')).rejects.toThrow(ForbiddenException);
    });

    it('propustí pokud AKJ stačí', async () => {
      const restricted = { ...mockPage, accessRequirements: [{ type: 'AKJ', value: '5' }] };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockMembership, akj: 5 });
      const result = await service.findBySlug('hlavni-lokace', 'world1', 'user1');
      expect(result.id).toBe('page1');
    });

    it('propustí pokud UserId odpovídá', async () => {
      const restricted = { ...mockPage, accessRequirements: [{ type: 'UserId', value: 'user1' }] };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      const result = await service.findBySlug('hlavni-lokace', 'world1', 'user1');
      expect(result.id).toBe('page1');
    });
  });

  describe('create', () => {
    it('vyhodí ConflictException pokud slug v světě existuje', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(true);
      await expect(service.create({ slug: 'hlavni-lokace', type: 'Lokace', title: 'X' }, 'world1')).rejects.toThrow(ConflictException);
    });

    it('vytvoří stránku se slug lowercase', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockResolvedValue({ ...mockPage, slug: 'hlavni-lokace' });
      await service.create({ slug: 'Hlavni-Lokace', type: 'Lokace', title: 'X' }, 'world1');
      expect(mockPagesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ slug: 'hlavni-lokace' }));
    });
  });

  describe('delete', () => {
    it('vyhodí NotFoundException pokud stránka neexistuje', async () => {
      mockPagesRepo.findById.mockResolvedValue(null);
      await expect(service.delete('neexistuje', 'world1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí ForbiddenException pokud stránka patří jinému světu', async () => {
      mockPagesRepo.findById.mockResolvedValue({ ...mockPage, worldId: 'jiny-svet' });
      await expect(service.delete('page1', 'world1')).rejects.toThrow(ForbiddenException);
    });
  });
});
