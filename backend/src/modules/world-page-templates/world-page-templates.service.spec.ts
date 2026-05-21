import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { WorldPageTemplatesService } from './world-page-templates.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { WorldPageTemplate } from './interfaces/world-page-template.interface';

const adminRequester = { id: 'admin', role: UserRole.Admin };
const hracRequester = { id: 'hrac', role: UserRole.Hrac };
const korektorRequester = { id: 'korektor', role: UserRole.Hrac };

const mockTemplate: WorldPageTemplate = {
  id: 't1',
  worldId: 'w1',
  key: 'stat',
  label: 'Stát',
  headers: ['Hl. město', 'Měna'],
  defaultTitle: 'Profil státu',
  icon: 'Globe',
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('WorldPageTemplatesService', () => {
  let service: WorldPageTemplatesService;
  const repo = {
    findByWorld: jest.fn(),
    findById: jest.fn(),
    existsByKey: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const membershipRepo = { findByUserAndWorld: jest.fn() };
  const worldsRepo = { findById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorldPageTemplatesService,
        { provide: 'IWorldPageTemplatesRepository', useValue: repo },
        { provide: 'IWorldMembershipRepository', useValue: membershipRepo },
        { provide: 'IWorldsRepository', useValue: worldsRepo },
      ],
    }).compile();
    service = module.get(WorldPageTemplatesService);
  });

  describe('findByWorld', () => {
    it('vrátí seznam šablon', async () => {
      repo.findByWorld.mockResolvedValueOnce([mockTemplate]);
      const result = await service.findByWorld('w1');
      expect(result).toEqual([mockTemplate]);
      expect(repo.findByWorld).toHaveBeenCalledWith('w1');
    });
  });

  describe('create', () => {
    const dto = {
      key: 'mesto',
      label: 'Město',
      headers: ['Stát', 'Obyvatel'],
    };

    it('Admin vytvoří šablonu bez membership checku', async () => {
      repo.existsByKey.mockResolvedValueOnce(false);
      repo.save.mockResolvedValueOnce(mockTemplate);
      await service.create('w1', dto, adminRequester);
      expect(membershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });

    it('Hráč ve světě bez Korektor role dostane 403', async () => {
      worldsRepo.findById.mockResolvedValueOnce({ id: 'w1', slug: 'foo' });
      membershipRepo.findByUserAndWorld.mockResolvedValueOnce({
        role: WorldRole.Hrac,
      });
      await expect(
        service.create('w1', dto, hracRequester),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('Korektor projde a vytvoří šablonu', async () => {
      worldsRepo.findById.mockResolvedValueOnce({ id: 'w1' });
      membershipRepo.findByUserAndWorld.mockResolvedValueOnce({
        role: WorldRole.Korektor,
      });
      repo.existsByKey.mockResolvedValueOnce(false);
      repo.save.mockResolvedValueOnce(mockTemplate);
      const result = await service.create('w1', dto, korektorRequester);
      expect(result).toEqual(mockTemplate);
    });

    it('duplicitní key vyhodí 409', async () => {
      repo.existsByKey.mockResolvedValueOnce(true);
      await expect(
        service.create('w1', dto, adminRequester),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('neexistující svět vyhodí 404 pro ne-admina', async () => {
      worldsRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.create('w-bad', dto, hracRequester),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('mismatch worldId → 403', async () => {
      repo.findById.mockResolvedValueOnce({ ...mockTemplate, worldId: 'w2' });
      await expect(
        service.update('w1', 't1', { label: 'New' }, adminRequester),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('neexistující template → 404', async () => {
      repo.findById.mockResolvedValueOnce(null);
      await expect(
        service.update('w1', 't1', { label: 'X' }, adminRequester),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('key collision při změně → 409', async () => {
      repo.findById.mockResolvedValueOnce(mockTemplate);
      repo.existsByKey.mockResolvedValueOnce(true);
      await expect(
        service.update('w1', 't1', { key: 'mesto' }, adminRequester),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('stejný key pass-through (přeskočí unique check)', async () => {
      repo.findById.mockResolvedValueOnce(mockTemplate);
      repo.update.mockResolvedValueOnce({ ...mockTemplate, label: 'X' });
      const result = await service.update(
        'w1',
        't1',
        { key: 'stat', label: 'X' },
        adminRequester,
      );
      expect(repo.existsByKey).not.toHaveBeenCalled();
      expect(result.label).toBe('X');
    });
  });

  describe('delete', () => {
    it('mismatch worldId → 403', async () => {
      repo.findById.mockResolvedValueOnce({ ...mockTemplate, worldId: 'w2' });
      await expect(
        service.delete('w1', 't1', adminRequester),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('neexistující → 404', async () => {
      repo.findById.mockResolvedValueOnce(null);
      await expect(
        service.delete('w1', 't1', adminRequester),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('admin smaže OK', async () => {
      repo.findById.mockResolvedValueOnce(mockTemplate);
      repo.delete.mockResolvedValueOnce(true);
      await expect(
        service.delete('w1', 't1', adminRequester),
      ).resolves.toBeUndefined();
      expect(repo.delete).toHaveBeenCalledWith('t1');
    });
  });
});
