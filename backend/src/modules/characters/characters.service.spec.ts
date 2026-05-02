import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CharactersService } from './characters.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockCharacter = {
  id: 'char1', slug: 'medak', worldId: 'world1',
  userId: 'user1', isNpc: false,
  publicBio: '<p>veřejné</p>', publicInfoBlocks: [],
  privateBio: '<p>soukromé</p>', privateInfoBlocks: [],
  accessRequirements: [], createdAt: new Date(),
};

const mockNpc = { ...mockCharacter, id: 'char2', slug: 'agent-smith', userId: undefined, isNpc: true };

const mockMembership = { id: 'mem1', userId: 'user1', worldId: 'world1', role: WorldRole.Hrac, akj: 5, joinedAt: new Date() };
const mockPjMembership = { ...mockMembership, role: WorldRole.PJ };

describe('CharactersService', () => {
  let service: CharactersService;
  const mockCharRepo = {
    findById: jest.fn(),
    findBySlugAndWorld: jest.fn(),
    findByWorld: jest.fn(),
    findByUserAndWorld: jest.fn(),
    existsBySlugAndWorld: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: 'ICharactersRepository', useValue: mockCharRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    service = module.get(CharactersService);
  });

  describe('findBySlug', () => {
    it('vrátí veřejnou část NPC pro běžného hráče', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      const result = await service.findBySlug('agent-smith', 'world1', 'user1');
      expect(result).toHaveProperty('publicBio');
      expect(result).not.toHaveProperty('privateBio');
    });

    it('vrátí plnou postavu PJ pro NPC', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPjMembership);
      const result = await service.findBySlug('agent-smith', 'world1', 'pj1');
      expect(result).toHaveProperty('privateBio');
    });

    it('vrátí plnou postavu přiřazenému hráči CP', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      const result = await service.findBySlug('medak', 'world1', 'user1');
      expect(result).toHaveProperty('privateBio');
    });

    it('vrátí jen veřejnou část CP pro cizího hráče', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockMembership, userId: 'jiny-user' });
      const result = await service.findBySlug('medak', 'world1', 'jiny-user');
      expect(result).toHaveProperty('publicBio');
      expect(result).not.toHaveProperty('privateBio');
    });

    it('vyhodí NotFoundException pokud postava neexistuje', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(null);
      await expect(service.findBySlug('neexistuje', 'world1', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('vyhodí ConflictException pokud slug existuje', async () => {
      mockCharRepo.existsBySlugAndWorld.mockResolvedValue(true);
      await expect(service.create({ slug: 'medak', isNpc: false }, 'world1')).rejects.toThrow(ConflictException);
    });

    it('emituje character.created po vytvoření', async () => {
      mockCharRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockCharRepo.save.mockResolvedValue(mockCharacter);
      await service.create({ slug: 'medak', isNpc: false }, 'world1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('character.created', expect.objectContaining({ characterId: 'char1', isNpc: false }));
    });
  });

  describe('convert', () => {
    it('CP → NPC: smaže userId, nastaví isNpc=true', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockCharRepo.update.mockResolvedValue({ ...mockCharacter, userId: undefined, isNpc: true });
      await service.convert('medak', 'world1', {});
      expect(mockCharRepo.update).toHaveBeenCalledWith('char1', expect.objectContaining({ userId: undefined, isNpc: true }));
    });

    it('NPC → CP: nastaví userId, nastaví isNpc=false', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockCharRepo.update.mockResolvedValue({ ...mockNpc, userId: 'user2', isNpc: false });
      await service.convert('agent-smith', 'world1', { userId: 'user2' });
      expect(mockCharRepo.update).toHaveBeenCalledWith('char2', expect.objectContaining({ userId: 'user2', isNpc: false }));
    });

    it('emituje character.converted', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockCharRepo.update.mockResolvedValue({ ...mockCharacter, userId: undefined, isNpc: true });
      await service.convert('medak', 'world1', {});
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('character.converted', expect.objectContaining({ characterId: 'char1' }));
    });
  });

  describe('findByUser', () => {
    it('vrátí CP hráče ve světě', async () => {
      mockCharRepo.findByUserAndWorld.mockResolvedValue(mockCharacter);
      const result = await service.findByUser('user1', 'world1');
      expect(result?.slug).toBe('medak');
    });
  });
});
