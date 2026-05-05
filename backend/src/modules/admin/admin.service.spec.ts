import { Test } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

describe('AdminService', () => {
  let service: AdminService;

  const mockUsersRepo = {
    findAllPaginated: jest.fn(),
    update: jest.fn(),
  };
  const mockPagesRepo = {
    findRecent: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserId: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(AdminService);
    jest.clearAllMocks();
  });

  describe('getUsers', () => {
    it('vrátí stránkovaný seznam uživatelů', async () => {
      mockUsersRepo.findAllPaginated.mockResolvedValue({ items: [], total: 0 });
      const result = await service.getUsers({ page: 1, limit: 20 });
      expect(mockUsersRepo.findAllPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('updateUserRole', () => {
    it('aktualizuje roli uživatele', async () => {
      const user = { id: 'u1', role: UserRole.Hrac };
      mockUsersRepo.update.mockResolvedValue({ ...user, role: UserRole.Admin });
      const result = await service.updateUserRole('u1', UserRole.Admin);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', { role: UserRole.Admin });
      expect(result?.role).toBe(UserRole.Admin);
    });
  });

  describe('updateUserAkj', () => {
    it('aktualizuje AKJ flag', async () => {
      mockUsersRepo.update.mockResolvedValue({ id: 'u1', akj: true });
      const result = await service.updateUserAkj('u1', true);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', { akj: true });
      expect(result?.akj).toBe(true);
    });
  });

  describe('getRecentPages', () => {
    it('Superadmin dostane stránky ze všech světů', async () => {
      const superadmin = { id: 'sa', role: UserRole.Superadmin };
      mockPagesRepo.findRecent.mockResolvedValue([]);
      await service.getRecentPages(superadmin, 20);
      expect(mockPagesRepo.findRecent).toHaveBeenCalledWith(20, undefined);
    });

    it('PJ dostane jen stránky ze světů kde je PJ', async () => {
      const pj = { id: 'pj1', role: UserRole.PJ };
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { worldId: 'w1', role: WorldRole.PJ },
        { worldId: 'w2', role: WorldRole.Hrac },
      ]);
      mockPagesRepo.findRecent.mockResolvedValue([]);
      await service.getRecentPages(pj, 20);
      expect(mockPagesRepo.findRecent).toHaveBeenCalledWith(20, ['w1']);
    });
  });
});
