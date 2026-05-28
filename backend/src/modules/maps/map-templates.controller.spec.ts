import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  MapTemplatesController,
  filterOutPcTokens,
} from './map-templates.controller';
import { UserRole } from '../users/interfaces/user.interface';
import type { MapTemplate } from './interfaces/map-template.interface';

/**
 * 10.2c-edit-2 C11 — controller + helper unit testy.
 *
 * Ověřuje per-PJ ownership matrix, PC token strip, ownerId immutability,
 * bug fixes (NotFoundException → ForbiddenException u 403 case).
 */

function makeTemplate(overrides: Partial<MapTemplate> = {}): MapTemplate {
  return {
    id: 'tpl1',
    ownerId: 'pj1',
    name: 'Test',
    imageUrl: '/some/img.png',
    config: { size: 40, originX: 0, originY: 0, showGrid: true },
    npcTemplates: [],
    tokens: [],
    effects: [],
    fogEnabled: false,
    revealedHexes: [],
    activeSoundIds: [],
    ...overrides,
  };
}

const sa = { id: 'sa', role: UserRole.Superadmin };
const admin = { id: 'admin', role: UserRole.Admin };
const pj1 = { id: 'pj1', role: UserRole.PJ };
const pj2 = { id: 'pj2', role: UserRole.PJ };
const hrac = { id: 'h1', role: UserRole.Hrac };

describe('filterOutPcTokens helper', () => {
  it('zachová NPC tokeny (isNpc===true)', () => {
    const tokens = [
      { id: 't1', isNpc: true },
      { id: 't2', isNpc: true },
    ];
    expect(filterOutPcTokens(tokens)).toEqual(tokens);
  });

  it('odstraní PC tokeny (isNpc===false)', () => {
    const tokens = [
      { id: 't1', isNpc: true },
      { id: 't2', isNpc: false },
    ];
    expect(filterOutPcTokens(tokens)).toEqual([{ id: 't1', isNpc: true }]);
  });

  it('odstraní tokeny bez isNpc field (default = PC)', () => {
    const tokens = [
      { id: 't1', isNpc: true },
      { id: 't2' }, // isNpc undefined
    ];
    expect(filterOutPcTokens(tokens)).toEqual([{ id: 't1', isNpc: true }]);
  });

  it('odolá null/non-object hodnotám v poli', () => {
    const tokens = [{ id: 't1', isNpc: true }, null, 'string', undefined, 42];
    expect(filterOutPcTokens(tokens)).toEqual([{ id: 't1', isNpc: true }]);
  });

  it('prázdný array → prázdný array', () => {
    expect(filterOutPcTokens([])).toEqual([]);
  });
});

describe('MapTemplatesController', () => {
  const mockRepo = {
    findAll: jest.fn(),
    findByOwner: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    replace: jest.fn(),
    delete: jest.fn(),
  };
  const mockMapsService = {} as never;
  const controller = new MapTemplatesController(mockRepo, mockMapsService);

  beforeEach(() => jest.clearAllMocks());

  describe('findAll — per-PJ filter', () => {
    it('Sa → findAll() (všechny šablony)', async () => {
      mockRepo.findAll.mockResolvedValue([]);
      await controller.findAll(sa);
      expect(mockRepo.findAll).toHaveBeenCalled();
      expect(mockRepo.findByOwner).not.toHaveBeenCalled();
    });

    it('Admin → findAll() (všechny šablony)', async () => {
      mockRepo.findAll.mockResolvedValue([]);
      await controller.findAll(admin);
      expect(mockRepo.findAll).toHaveBeenCalled();
      expect(mockRepo.findByOwner).not.toHaveBeenCalled();
    });

    it('PJ → findByOwner(user.id) (jen své)', async () => {
      mockRepo.findByOwner.mockResolvedValue([]);
      await controller.findAll(pj1);
      expect(mockRepo.findByOwner).toHaveBeenCalledWith('pj1');
      expect(mockRepo.findAll).not.toHaveBeenCalled();
    });

    it('Hráč → findByOwner(user.id) (jen své — typicky 0)', async () => {
      mockRepo.findByOwner.mockResolvedValue([]);
      await controller.findAll(hrac);
      expect(mockRepo.findByOwner).toHaveBeenCalledWith('h1');
    });
  });

  describe('findById — ownership check', () => {
    it('Existující vlastní šablona → vrátí ji', async () => {
      const tpl = makeTemplate({ ownerId: 'pj1' });
      mockRepo.findById.mockResolvedValue(tpl);
      const result = await controller.findById('tpl1', pj1);
      expect(result).toBe(tpl);
    });

    it('Cizí šablona, PJ → 403 MAP_TEMPLATE_FORBIDDEN_OWNER', async () => {
      mockRepo.findById.mockResolvedValue(makeTemplate({ ownerId: 'pj1' }));
      const promise = controller.findById('tpl1', pj2);
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'MAP_TEMPLATE_FORBIDDEN_OWNER' },
      });
    });

    it('Cizí šablona, Admin → vrátí ji (bypass)', async () => {
      const tpl = makeTemplate({ ownerId: 'pj1' });
      mockRepo.findById.mockResolvedValue(tpl);
      const result = await controller.findById('tpl1', admin);
      expect(result).toBe(tpl);
    });

    it('Neexistující → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      const promise = controller.findById('xxx', pj1);
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'MAP_TEMPLATE_NOT_FOUND' },
      });
    });
  });

  describe('create — role + ownerId enforced + PC strip', () => {
    const dto = {
      name: 'Nová',
      imageUrl: '/x.png',
      config: { size: 40 },
      tokens: [
        { id: 'npc1', isNpc: true },
        { id: 'pc1', isNpc: false }, // musí být odstraněn
      ],
    };

    it('PJ → create s ownerId=user.id, tokens filtrované', async () => {
      mockRepo.create.mockResolvedValue(makeTemplate());
      await controller.create(dto, pj1);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'pj1',
          tokens: [{ id: 'npc1', isNpc: true }], // PC pryč
        }),
      );
    });

    it('Hráč → 403 MAP_TEMPLATE_FORBIDDEN (bug fix: dříve NotFoundException)', async () => {
      const promise = controller.create(dto, hrac);
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'MAP_TEMPLATE_FORBIDDEN' },
      });
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('replace — ownership + ownerId immutability + PC strip', () => {
    const dto = {
      name: 'Renamed',
      imageUrl: '/x.png',
      config: { size: 40 },
      tokens: [{ id: 't1', isNpc: true }],
      ownerId: 'CIZI', // pokus o převzetí — musí být ignorován
    };

    it('Vlastní → replace s zachovaným ownerId z existing', async () => {
      mockRepo.findById.mockResolvedValue(makeTemplate({ ownerId: 'pj1' }));
      mockRepo.replace.mockResolvedValue(makeTemplate());
      await controller.replace('tpl1', dto, pj1);
      expect(mockRepo.replace).toHaveBeenCalledWith(
        'tpl1',
        expect.objectContaining({
          ownerId: 'pj1', // ne 'CIZI'
        }),
      );
    });

    it('Cizí jako PJ → 403 MAP_TEMPLATE_FORBIDDEN_OWNER', async () => {
      mockRepo.findById.mockResolvedValue(makeTemplate({ ownerId: 'pj1' }));
      await expect(
        controller.replace('tpl1', dto as never, pj2),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Cizí jako Admin → projde (bypass)', async () => {
      mockRepo.findById.mockResolvedValue(makeTemplate({ ownerId: 'pj1' }));
      mockRepo.replace.mockResolvedValue(makeTemplate());
      await controller.replace('tpl1', dto, admin);
      expect(mockRepo.replace).toHaveBeenCalled();
    });

    it('Hráč → 403 MAP_TEMPLATE_FORBIDDEN', async () => {
      await expect(
        controller.replace('tpl1', dto as never, hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Neexistující → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        controller.replace('xxx', dto as never, pj1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete — ownership check', () => {
    it('Vlastní → delete', async () => {
      mockRepo.findById.mockResolvedValue(makeTemplate({ ownerId: 'pj1' }));
      mockRepo.delete.mockResolvedValue(true);
      await controller.delete('tpl1', pj1);
      expect(mockRepo.delete).toHaveBeenCalledWith('tpl1');
    });

    it('Cizí jako PJ → 403', async () => {
      mockRepo.findById.mockResolvedValue(makeTemplate({ ownerId: 'pj1' }));
      await expect(controller.delete('tpl1', pj2)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('Cizí jako Admin → projde', async () => {
      mockRepo.findById.mockResolvedValue(makeTemplate({ ownerId: 'pj1' }));
      mockRepo.delete.mockResolvedValue(true);
      await controller.delete('tpl1', admin);
      expect(mockRepo.delete).toHaveBeenCalled();
    });

    it('Hráč → 403', async () => {
      await expect(controller.delete('tpl1', hrac)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
