import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorldMapsService } from './world-maps.service';
import type { IWorldMapsRepository } from './interfaces/world-maps-repository.interface';
import type { IWorldMapFoldersRepository } from './interfaces/world-map-folders-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { WorldMapEntry } from './interfaces/world-map.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

function entry(over: Partial<WorldMapEntry> = {}): WorldMapEntry {
  return {
    id: 'm1',
    folderId: null,
    title: 'Mapa',
    description: '',
    imageUrl: 'https://cdn/m.png',
    order: 0,
    isPublic: false,
    visibleToPlayerIds: [],
    createdAt: '2026-06-06T00:00:00.000Z',
    updatedAt: '2026-06-06T00:00:00.000Z',
    ...over,
  };
}

describe('WorldMapsService', () => {
  let repo: jest.Mocked<IWorldMapsRepository>;
  let foldersRepo: jest.Mocked<IWorldMapFoldersRepository>;
  let membershipRepo: { findByUserAndWorld: jest.Mock };
  let service: WorldMapsService;

  beforeEach(() => {
    repo = {
      findByWorld: jest.fn().mockResolvedValue([]),
      addMap: jest.fn(),
      updateMap: jest.fn(),
      removeMap: jest.fn(),
      reorder: jest.fn(),
      reparentMaps: jest.fn(),
    };
    foldersRepo = {
      findByWorld: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      reorder: jest.fn(),
      reparentChildren: jest.fn(),
    };
    membershipRepo = { findByUserAndWorld: jest.fn() };
    service = new WorldMapsService(
      repo,
      foldersRepo,
      membershipRepo as unknown as IWorldMembershipRepository,
      { emit: jest.fn() } as unknown as EventEmitter2,
    );
  });

  describe('canManage', () => {
    it('elevovaný platform Admin+ smí vždy', async () => {
      expect(
        await service.canManage(
          { id: 'u', role: UserRole.Admin, elevatedWorldIds: ['w'] },
          'w',
        ),
      ).toBe(true);
      expect(
        await service.canManage(
          { id: 'u', role: UserRole.Superadmin, elevatedWorldIds: ['w'] },
          'w',
        ),
      ).toBe(true);
      expect(membershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('Admin BEZ elevace = bez bypassu (padá na membership)', async () => {
      membershipRepo.findByUserAndWorld.mockResolvedValueOnce(null);
      expect(
        await service.canManage({ id: 'u', role: UserRole.Admin }, 'w'),
      ).toBe(false);
      expect(membershipRepo.findByUserAndWorld).toHaveBeenCalledWith('u', 'w');
    });

    it('world PJ smí, hráč ne', async () => {
      membershipRepo.findByUserAndWorld.mockResolvedValueOnce({
        role: WorldRole.PJ,
      });
      expect(
        await service.canManage({ id: 'u', role: UserRole.Hrac }, 'w'),
      ).toBe(true);

      membershipRepo.findByUserAndWorld.mockResolvedValueOnce({
        role: WorldRole.Hrac,
      });
      expect(
        await service.canManage({ id: 'u', role: UserRole.Hrac }, 'w'),
      ).toBe(false);
    });

    it('PomocnyPJ smí (D-NEW-INV-MAPS — sjednoceno na PomocnyPJ+)', async () => {
      membershipRepo.findByUserAndWorld.mockResolvedValueOnce({
        role: WorldRole.PomocnyPJ,
      });
      expect(
        await service.canManage({ id: 'u', role: UserRole.Hrac }, 'w'),
      ).toBe(true);
    });

    it('assertCanManage hodí 403 bez oprávnění', async () => {
      membershipRepo.findByUserAndWorld.mockResolvedValueOnce({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertCanManage({ id: 'u', role: UserRole.Hrac }, 'w'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    const maps = [
      entry({ id: 'a', order: 1, isPublic: true }),
      entry({ id: 'b', order: 0, isPublic: false, visibleToPlayerIds: ['u1'] }),
      entry({ id: 'c', order: 2, isPublic: false, visibleToPlayerIds: ['u2'] }),
    ];

    it('PJ/Admin dostane vše setříděné dle order (vč. visibleToPlayerIds)', async () => {
      repo.findByWorld.mockResolvedValue(maps);
      const res = await service.list('w', 'u1', true);
      expect(res.map((m) => m.id)).toEqual(['b', 'a', 'c']);
      expect(res[0].visibleToPlayerIds).toEqual(['u1']);
    });

    it('hráč vidí jen public + své; visibleToPlayerIds je vymazané (leak-safe)', async () => {
      repo.findByWorld.mockResolvedValue(maps);
      const res = await service.list('w', 'u1', false);
      expect(res.map((m) => m.id)).toEqual(['b', 'a']); // b (jeho), a (public)
      expect(res.every((m) => m.visibleToPlayerIds.length === 0)).toBe(true);
    });

    it('anonym (userId null) vidí jen public', async () => {
      repo.findByWorld.mockResolvedValue(maps);
      const res = await service.list('w', null, false);
      expect(res.map((m) => m.id)).toEqual(['a']);
    });
  });

  describe('create', () => {
    it('order = počet existujících, defaulty doplněné', async () => {
      repo.findByWorld.mockResolvedValue([entry({ id: 'x' })]);
      repo.addMap.mockImplementation((_w, e) => Promise.resolve(e));
      const res = await service.create('w', {
        title: '  Hlavní mapa  ',
        imageUrl: 'https://cdn/h.png',
      });
      expect(res.order).toBe(1);
      expect(res.title).toBe('Hlavní mapa');
      expect(res.isPublic).toBe(false);
      expect(res.visibleToPlayerIds).toEqual([]);
      expect(res.id).toBeTruthy();
    });
  });

  describe('update / remove', () => {
    it('update neexistující mapy → 404', async () => {
      repo.updateMap.mockResolvedValue(null);
      await expect(service.update('w', 'nope', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('remove neexistující mapy → 404', async () => {
      repo.removeMap.mockResolvedValue(false);
      await expect(service.remove('w', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
