import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BestiaeService } from './bestiae.service';
import { BestiaeRepository } from './repositories/bestiae.repository';
import { SystemStatsValidatorService } from '../maps/schemas/system-entity-schema/system-stats-validator.service';
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
    create: jest.fn((doc) => Promise.resolve({ id: 'b1', ...doc })),
    updateAtomic: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
  };
  const mockValidator = {
    validateForCreate: jest.fn(),
    validateForPatch: jest.fn(),
  };
  const mockMemberRepo = { findByUserAndWorld: jest.fn() };
  // C-34 — service emituje 'bestiae.changed' po každé mutaci.
  const mockEventEmitter = { emit: jest.fn() };

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
        { provide: EventEmitter2, useValue: mockEventEmitter },
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
});
