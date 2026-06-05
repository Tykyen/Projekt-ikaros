import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScenarioTemplatesController } from './scenario-templates.controller';
import { UserRole } from '../users/interfaces/user.interface';
import type { ScenarioTemplate } from './interfaces/scenario-template.interface';

/** 11.2-ext E — controller unit testy: role gate + per-PJ ownership. */

function makeTpl(overrides: Partial<ScenarioTemplate> = {}): ScenarioTemplate {
  return {
    id: 'tpl1',
    ownerId: 'pj1',
    name: 'Útok na hrad',
    scenarioTitle: 'Scéna',
    contentData: {},
    ...overrides,
  };
}

const sa = { id: 'sa', role: UserRole.Superadmin };
const admin = { id: 'admin', role: UserRole.Admin };
const pj1 = { id: 'pj1', role: UserRole.PJ };
const pj2 = { id: 'pj2', role: UserRole.PJ };
const hrac = { id: 'h1', role: UserRole.Hrac };

describe('ScenarioTemplatesController', () => {
  const mockRepo = {
    findAll: jest.fn(),
    findByOwner: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const controller = new ScenarioTemplatesController(mockRepo);

  beforeEach(() => jest.clearAllMocks());

  describe('findAll — per-PJ filter', () => {
    it('Admin+ → findAll (všechny)', async () => {
      mockRepo.findAll.mockResolvedValue([]);
      await controller.findAll(admin);
      expect(mockRepo.findAll).toHaveBeenCalled();
      expect(mockRepo.findByOwner).not.toHaveBeenCalled();
    });

    it('Superadmin → findAll', async () => {
      mockRepo.findAll.mockResolvedValue([]);
      await controller.findAll(sa);
      expect(mockRepo.findAll).toHaveBeenCalled();
    });

    it('PJ → findByOwner(user.id)', async () => {
      mockRepo.findByOwner.mockResolvedValue([]);
      await controller.findAll(pj1);
      expect(mockRepo.findByOwner).toHaveBeenCalledWith('pj1');
      expect(mockRepo.findAll).not.toHaveBeenCalled();
    });
  });

  describe('create — role gate + ownerId enforced', () => {
    const dto = { name: 'X', scenarioTitle: 'S', contentData: { a: 1 } };

    it('PJ vytvoří s ownerId z auth', async () => {
      mockRepo.create.mockResolvedValue(makeTpl());
      await controller.create(dto, pj1);
      expect(mockRepo.create).toHaveBeenCalledWith({ ...dto, ownerId: 'pj1' });
    });

    it('Hráč vytvoří VLASTNÍ šablonu (R-15 — mrtvý global gate odstraněn)', async () => {
      mockRepo.create.mockResolvedValue(makeTpl({ ownerId: 'h1' }));
      await controller.create(dto, hrac);
      expect(mockRepo.create).toHaveBeenCalledWith({ ...dto, ownerId: 'h1' });
    });
  });

  describe('delete — ownership', () => {
    it('PJ smaže vlastní', async () => {
      mockRepo.findById.mockResolvedValue(makeTpl({ ownerId: 'pj1' }));
      mockRepo.delete.mockResolvedValue(true);
      await controller.delete('tpl1', pj1);
      expect(mockRepo.delete).toHaveBeenCalledWith('tpl1');
    });

    it('PJ nesmaže cizí → 403', async () => {
      mockRepo.findById.mockResolvedValue(makeTpl({ ownerId: 'pj1' }));
      await expect(controller.delete('tpl1', pj2)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('neexistující → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(controller.delete('x', pj1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('Admin smaže cizí (bypass)', async () => {
      mockRepo.findById.mockResolvedValue(makeTpl({ ownerId: 'pj1' }));
      mockRepo.delete.mockResolvedValue(true);
      await controller.delete('tpl1', admin);
      expect(mockRepo.delete).toHaveBeenCalledWith('tpl1');
    });
  });
});
