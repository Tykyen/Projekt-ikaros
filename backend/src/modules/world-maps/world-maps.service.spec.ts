import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorldMapsService } from './world-maps.service';
import type { IWorldMapsRepository } from './interfaces/world-maps-repository.interface';
import type { IWorldMapFoldersRepository } from './interfaces/world-map-folders-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type {
  WorldMapEntry,
  WorldMapPin,
} from './interfaces/world-map.interface';
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
    pins: [],
    linkedSceneId: null,
    createdAt: '2026-06-06T00:00:00.000Z',
    updatedAt: '2026-06-06T00:00:00.000Z',
    ...over,
  };
}

function pin(over: Partial<WorldMapPin> = {}): WorldMapPin {
  return {
    id: 'p1',
    x: 0.5,
    y: 0.5,
    label: 'Přístav',
    info: '',
    targetType: 'page',
    targetSlug: 'pristav',
    targetMapId: null,
    icon: 'anchor',
    color: 'cyan',
    isPublic: true,
    visibleToPlayerIds: [],
    ...over,
  };
}

describe('WorldMapsService', () => {
  let repo: jest.Mocked<IWorldMapsRepository>;
  let foldersRepo: jest.Mocked<IWorldMapFoldersRepository>;
  let membershipRepo: { findByUserAndWorld: jest.Mock };
  let worldsRepo: { findById: jest.Mock };
  let service: WorldMapsService;

  beforeEach(() => {
    repo = {
      findByWorld: jest.fn().mockResolvedValue([]),
      addMap: jest.fn(),
      updateMap: jest.fn(),
      removeMap: jest.fn(),
      reorder: jest.fn(),
      reparentMaps: jest.fn(),
      addPin: jest.fn(),
      updatePin: jest.fn(),
      removePin: jest.fn(),
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
    // R-AUDIT — default: nesledovaný svět (findById undefined → assertCanViewAtlas
    // propustí; per-metoda list/listFolders worldsRepo nevolají).
    worldsRepo = { findById: jest.fn() };
    service = new WorldMapsService(
      repo,
      foldersRepo,
      membershipRepo as unknown as IWorldMembershipRepository,
      worldsRepo as unknown as IWorldsRepository,
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

    // D-19.2 — imageBytes z DTO (FE ho přeposílá z uploadu) se persistuje.
    it('D-19.2 — uloží imageBytes z DTO', async () => {
      repo.findByWorld.mockResolvedValue([]);
      repo.addMap.mockImplementation((_w, e) => Promise.resolve(e));
      const res = await service.create('w', {
        title: 'Mapa',
        imageUrl: 'https://cdn/h.png',
        imageBytes: 123_456,
      });
      expect(res.imageBytes).toBe(123_456);
      expect(repo.addMap).toHaveBeenCalledWith(
        'w',
        expect.objectContaining({ imageBytes: 123_456 }),
      );
    });
  });

  describe('update / remove', () => {
    it('update neexistující mapy → 404', async () => {
      repo.updateMap.mockResolvedValue(null);
      await expect(service.update('w', 'nope', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    // D-19.2 — výměna obrázku nese i novou velikost blobu.
    it('D-19.2 — update propíše imageBytes do patche', async () => {
      repo.findByWorld.mockResolvedValue([entry({ id: 'm1' })]);
      repo.updateMap.mockResolvedValue(
        entry({ imageUrl: 'https://cdn/new.png', imageBytes: 777 }),
      );
      const res = await service.update('w', 'm1', {
        imageUrl: 'https://cdn/new.png',
        imageBytes: 777,
      });
      expect(repo.updateMap).toHaveBeenCalledWith(
        'w',
        'm1',
        expect.objectContaining({
          imageUrl: 'https://cdn/new.png',
          imageBytes: 777,
        }),
      );
      expect(res.imageBytes).toBe(777);
    });

    it('remove neexistující mapy → 404', async () => {
      repo.removeMap.mockResolvedValue(false);
      await expect(service.remove('w', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('list — vlaječky (16.5)', () => {
    it('hráč: tajný pin odfiltrován, visibleToPlayerIds pinů vymazané', async () => {
      const map = entry({
        id: 'a',
        isPublic: true,
        pins: [
          pin({ id: 'pub', isPublic: true }),
          pin({ id: 'mine', isPublic: false, visibleToPlayerIds: ['u1'] }),
          pin({ id: 'secret', isPublic: false, visibleToPlayerIds: ['u2'] }),
        ],
      });
      repo.findByWorld.mockResolvedValue([map]);
      const res = await service.list('w', 'u1', false);
      expect(res[0].pins.map((p) => p.id)).toEqual(['pub', 'mine']);
      expect(res[0].pins.every((p) => p.visibleToPlayerIds.length === 0)).toBe(
        true,
      );
    });

    it('PJ vidí všechny piny včetně tajných a visibleToPlayerIds', async () => {
      const map = entry({
        id: 'a',
        pins: [
          pin({ id: 'pub', isPublic: true }),
          pin({ id: 'secret', isPublic: false, visibleToPlayerIds: ['u2'] }),
        ],
      });
      repo.findByWorld.mockResolvedValue([map]);
      const res = await service.list('w', 'u9', true);
      expect(res[0].pins.map((p) => p.id)).toEqual(['pub', 'secret']);
      expect(res[0].pins[1].visibleToPlayerIds).toEqual(['u2']);
    });
  });

  describe('pins CRUD (16.5)', () => {
    it('createPin doplní id + defaulty, label trimne', async () => {
      repo.addPin.mockImplementation((_w, _m, _p) =>
        Promise.resolve(entry({ pins: [_p] })),
      );
      const res = await service.createPin('w', 'm1', {
        x: 0.3,
        y: 0.7,
        label: '  Docky  ',
        targetType: 'page',
        targetSlug: 'docky',
      });
      const created = res.pins[0];
      expect(created.id).toBeTruthy();
      expect(created.label).toBe('Docky');
      expect(created.icon).toBe('marker');
      expect(created.color).toBe('cyan');
      expect(created.isPublic).toBe(true);
    });

    it('createPin na neexistující mapě → 404', async () => {
      repo.addPin.mockResolvedValue(null);
      await expect(
        service.createPin('w', 'nope', { x: 0, y: 0 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updatePin: mapa existuje ale pin chybí → 404 PIN_NOT_FOUND', async () => {
      repo.updatePin.mockResolvedValue(entry({ pins: [] }));
      await expect(
        service.updatePin('w', 'm1', 'ghost', { label: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updatePin OK vrací mapu s pinem', async () => {
      repo.updatePin.mockResolvedValue(
        entry({ pins: [pin({ id: 'p1', label: 'Nové' })] }),
      );
      const res = await service.updatePin('w', 'm1', 'p1', { label: 'Nové' });
      expect(res.pins[0].label).toBe('Nové');
    });

    it('removePin na neexistující mapě → 404', async () => {
      repo.removePin.mockResolvedValue(null);
      await expect(service.removePin('w', 'nope', 'p1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
