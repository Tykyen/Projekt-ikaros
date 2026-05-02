import { Test } from '@nestjs/testing';
import { PopulateProfileImagesService } from './populate-profile-images.service';

describe('PopulateProfileImagesService', () => {
  let service: PopulateProfileImagesService;

  const mockCharactersRepo = { findAll: jest.fn() };
  const mockUsersRepo = { findById: jest.fn(), update: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PopulateProfileImagesService,
        { provide: 'ICharactersRepository', useValue: mockCharactersRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
      ],
    }).compile();
    service = module.get(PopulateProfileImagesService);
  });

  describe('populateFromCharacter', () => {
    it('nastaví profileImageUrl pokud user ho nemá', async () => {
      mockUsersRepo.findById.mockResolvedValue({ id: 'u1', profileImageUrl: undefined });
      mockUsersRepo.update.mockResolvedValue({});
      await service.populateFromCharacter({ userId: 'u1', imageUrl: 'https://img.example.com/a.jpg', isNpc: false } as any);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', { profileImageUrl: 'https://img.example.com/a.jpg' });
    });

    it('nepřepíše profileImageUrl pokud user ho má', async () => {
      mockUsersRepo.findById.mockResolvedValue({ id: 'u1', profileImageUrl: 'https://img.example.com/existing.jpg' });
      await service.populateFromCharacter({ userId: 'u1', imageUrl: 'https://img.example.com/new.jpg', isNpc: false } as any);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('přeskočí NPC (bez userId)', async () => {
      await service.populateFromCharacter({ userId: undefined, imageUrl: 'https://img.example.com/npc.jpg', isNpc: true } as any);
      expect(mockUsersRepo.findById).not.toHaveBeenCalled();
    });

    it('přeskočí pokud character nemá imageUrl', async () => {
      await service.populateFromCharacter({ userId: 'u1', imageUrl: undefined, isNpc: false } as any);
      expect(mockUsersRepo.findById).not.toHaveBeenCalled();
    });

    it('přeskočí pokud user neexistuje', async () => {
      mockUsersRepo.findById.mockResolvedValue(null);
      await service.populateFromCharacter({ userId: 'u1', imageUrl: 'https://img.example.com/a.jpg', isNpc: false } as any);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('onApplicationBootstrap', () => {
    it('zpracuje CP a přeskočí NPC při backfillu', async () => {
      const cp = { userId: 'u1', imageUrl: 'https://img.example.com/a.jpg', isNpc: false };
      const npc = { userId: undefined, imageUrl: 'https://img.example.com/npc.jpg', isNpc: true };
      mockCharactersRepo.findAll.mockResolvedValue([cp, npc]);
      mockUsersRepo.findById.mockResolvedValue({ id: 'u1', profileImageUrl: undefined });
      mockUsersRepo.update.mockResolvedValue({});
      await service.onApplicationBootstrap();
      expect(mockUsersRepo.update).toHaveBeenCalledTimes(1);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', { profileImageUrl: 'https://img.example.com/a.jpg' });
    });
  });
});
