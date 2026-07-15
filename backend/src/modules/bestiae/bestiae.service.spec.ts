import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BestiaeService } from './bestiae.service';
import { BestiaeRepository } from './repositories/bestiae.repository';
import { SystemStatsValidatorService } from '../maps/schemas/system-entity-schema/system-stats-validator.service';
import { EntitySchemaVersionsService } from '../entity-schema-versions/entity-schema-versions.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateBestieDto } from './dto/create-bestie.dto';

/**
 * Pokrývá změny ze sjednocení bestiáře (NpcTemplate → Bestie):
 * - `system` scope create — admin-only guard
 * - soft-mode validace systemStats (schema chybí → projde; data-chyba → throw)
 */
describe('BestiaeService', () => {
  let service: BestiaeService;

  const mockRepo = {
    findVisible: jest.fn(),
    findById: jest.fn(),
    // D-SEC-GAP-2026-07-11 — creation-flood capy; default hluboko pod stropem.
    countByWorldId: jest.fn().mockResolvedValue(0),
    countByOwner: jest.fn().mockResolvedValue(0),
    create: jest.fn((doc) => Promise.resolve({ id: 'b1', ...doc })),
    updateAtomic: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    findImageUrlsByOwner: jest.fn().mockResolvedValue([]),
    deleteAllByOwner: jest.fn(),
  };
  const mockValidator = {
    validateForCreate: jest.fn(),
    validateForPatch: jest.fn(),
  };
  const mockMemberRepo = { findByUserAndWorld: jest.fn() };
  // 22.4 — vitrína brána si sahá na world doc; default „svět neexistuje".
  const mockWorldsRepo = { findById: jest.fn().mockResolvedValue(null) };
  // C-34 — service emituje 'bestiae.changed' po každé mutaci.
  const mockEventEmitter = { emit: jest.fn() };
  // 16.2g F2 — world-scoped validace čte per-world bestie schema; default = žádné
  // (→ fallback na registry validator).
  const mockEntitySchemas = {
    getActiveSchema: jest.fn().mockResolvedValue(null),
  };

  const admin = { id: 'sa', role: UserRole.Superadmin };
  const hrac = { id: 'h', role: UserRole.Hrac };

  const baseCreate: CreateBestieDto = {
    scope: 'system',
    systemId: 'matrix',
    name: 'Duch',
    systemStats: { 'health.max': 5 },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: schema validní (filled = vstup).
    mockValidator.validateForCreate.mockReturnValue({
      valid: true,
      errors: {},
      filled: { 'health.max': 5 },
    });
    const module = await Test.createTestingModule({
      providers: [
        BestiaeService,
        { provide: BestiaeRepository, useValue: mockRepo },
        { provide: SystemStatsValidatorService, useValue: mockValidator },
        { provide: 'IWorldMembershipRepository', useValue: mockMemberRepo },
        // 22.4 vitrína — world lookup pro anonymní bránu.
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EntitySchemaVersionsService, useValue: mockEntitySchemas },
      ],
    }).compile();
    service = module.get(BestiaeService);
  });

  describe('create — system scope', () => {
    it('Admin/Superadmin vytvoří system bestii (bez worldId/ownerUserId)', async () => {
      await service.create(baseCreate, admin);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'system',
          systemId: 'matrix',
          ownerUserId: undefined,
          worldId: undefined,
        }),
      );
    });

    it('běžný uživatel (Hráč) dostane Forbidden', async () => {
      await expect(service.create(baseCreate, hrac)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('list — world scope gate (IDOR fix)', () => {
    it('člen světa dostane world-scoped bestie', async () => {
      mockMemberRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockRepo.findVisible.mockResolvedValue([
        { id: 'w1', scope: 'world', worldId: 'world1', systemId: 'matrix' },
      ]);
      const res = await service.list('matrix', hrac, 'world1');
      expect(res.world).toHaveLength(1);
    });

    it('nečlen světa → ForbiddenException (dřív leak bestiáře cizího světa)', async () => {
      mockMemberRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.list('matrix', hrac, 'world1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.findVisible).not.toHaveBeenCalled();
    });

    it('bez worldId (system/user katalog) — world brána se nespustí', async () => {
      mockRepo.findVisible.mockResolvedValue([]);
      await service.list('matrix', hrac);
      expect(mockMemberRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });
  });

  describe('create — soft-mode validace', () => {
    it('chybějící schema (errors._schema) → projde, NEthrowne', async () => {
      mockValidator.validateForCreate.mockReturnValue({
        valid: false,
        errors: { _schema: 'No schema for matrix:bestie' },
        filled: { 'health.max': 5 },
      });
      await expect(
        service.create({ ...baseCreate, scope: 'user' }, hrac),
      ).resolves.toBeDefined();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('reálná data-chyba (schema existuje) → BadRequestException', async () => {
      mockValidator.validateForCreate.mockReturnValue({
        valid: false,
        errors: { 'health.max': 'MAX HP is required' },
        filled: {},
      });
      await expect(
        service.create({ ...baseCreate, scope: 'user' }, hrac),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  // FIX-4 (BE oprava dávka, 2026-07) — hard-delete účtu uklidí 'user'-scope
  // bestie autora (jinak imageUrl blob osiří na Cloudinary navždy).
  describe('handleAccountHardDeleted', () => {
    it('posbírá imageUrl "user"-scope bestií ownera → media.orphaned + smaže je', async () => {
      mockRepo.findImageUrlsByOwner.mockResolvedValue([
        'https://res.cloudinary.com/x/bestie1.webp',
      ]);
      await service.handleAccountHardDeleted({ userId: 'h' });
      expect(mockRepo.findImageUrlsByOwner).toHaveBeenCalledWith('h');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: ['https://res.cloudinary.com/x/bestie1.webp'],
      });
      expect(mockRepo.deleteAllByOwner).toHaveBeenCalledWith('h');
    });

    it('bez obrázků — nic neemituje, ale pořád smaže bestie', async () => {
      mockRepo.findImageUrlsByOwner.mockResolvedValue([]);
      await service.handleAccountHardDeleted({ userId: 'h' });
      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        'media.orphaned',
        expect.anything(),
      );
      expect(mockRepo.deleteAllByOwner).toHaveBeenCalledWith('h');
    });
  });
});
