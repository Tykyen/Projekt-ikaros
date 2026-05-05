import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NpcTemplatesService } from './npc-templates.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockTemplate = {
  id: 'tpl1',
  worldId: 'world1',
  name: 'Goblin',
  imageUrl: undefined,
  notes: '',
  maxHp: 5,
  armor: 0,
  injury: 0,
  abilities: [],
  diarySchema: [],
  diaryData: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('NpcTemplatesService', () => {
  let service: NpcTemplatesService;
  const mockRepo = {
    findByWorld: jest.fn(),
    findGlobal: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateByIdAndWorld: jest.fn(),
    deleteByIdAndWorld: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NpcTemplatesService,
        { provide: 'INpcTemplatesRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(NpcTemplatesService);
  });

  describe('findAll', () => {
    it('vrátí šablony daného světa', async () => {
      mockRepo.findByWorld.mockResolvedValue([mockTemplate]);
      const result = await service.findAll('world1');
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });

    it('vrátí prázdné pole pokud svět nemá šablony', async () => {
      mockRepo.findByWorld.mockResolvedValue([]);
      const result = await service.findAll('world2');
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('vrátí šablonu pokud patří světu', async () => {
      mockRepo.findById.mockResolvedValue(mockTemplate);
      const result = await service.findOne('tpl1', 'world1');
      expect(result.name).toBe('Goblin');
    });

    it('vyhodí NotFoundException pokud šablona neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findOne('tpl1', 'world1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí NotFoundException pokud šablona patří jinému světu', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockTemplate, worldId: 'world2' });
      await expect(service.findOne('tpl1', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('předá worldId z parametru — ne z dto', async () => {
      mockRepo.create.mockResolvedValue(mockTemplate);
      await service.create({ name: 'Goblin' }, 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', name: 'Goblin' }),
      );
    });

    it('nastaví defaultní maxHp=5, armor=0, injury=0 pokud chybí v dto', async () => {
      mockRepo.create.mockResolvedValue(mockTemplate);
      await service.create({ name: 'Goblin' }, 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ maxHp: 5, armor: 0, injury: 0 }),
      );
    });
  });

  describe('update', () => {
    it('vrátí aktualizovanou šablonu', async () => {
      mockRepo.updateByIdAndWorld.mockResolvedValue({ ...mockTemplate, name: 'Super Goblin' });
      const result = await service.update('tpl1', 'world1', { name: 'Super Goblin' });
      expect(result.name).toBe('Super Goblin');
      expect(mockRepo.updateByIdAndWorld).toHaveBeenCalledWith('tpl1', 'world1', expect.objectContaining({ name: 'Super Goblin' }));
    });

    it('vyhodí NotFoundException pokud repo vrátí null (šablona neexistuje nebo jiný world)', async () => {
      mockRepo.updateByIdAndWorld.mockResolvedValue(null);
      await expect(service.update('tpl1', 'world1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('úspěšně smaže šablonu', async () => {
      mockRepo.deleteByIdAndWorld.mockResolvedValue(true);
      await expect(service.remove('tpl1', 'world1')).resolves.toBeUndefined();
      expect(mockRepo.deleteByIdAndWorld).toHaveBeenCalledWith('tpl1', 'world1');
    });

    it('vyhodí NotFoundException pokud repo vrátí false', async () => {
      mockRepo.deleteByIdAndWorld.mockResolvedValue(false);
      await expect(service.remove('tpl1', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findGlobal', () => {
    it('vrátí globální šablony (worldId = null)', async () => {
      const globalTpl = { ...mockTemplate, worldId: null };
      mockRepo.findGlobal.mockResolvedValue([globalTpl]);
      const result = await service.findGlobal();
      expect(result).toHaveLength(1);
      expect(mockRepo.findGlobal).toHaveBeenCalled();
    });
  });

  describe('importToWorld', () => {
    it('zkopíruje globální šablonu do světa s originTemplateId', async () => {
      const globalTpl = { ...mockTemplate, id: 'global1', worldId: null };
      mockRepo.findById.mockResolvedValue(globalTpl);
      mockRepo.create.mockResolvedValue({ ...mockTemplate, id: 'new1', worldId: 'world1' });
      const result = await service.importToWorld('global1', 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          originTemplateId: 'global1',
          name: 'Goblin',
        }),
      );
      expect(result.worldId).toBe('world1');
    });

    it('vyhodí NotFoundException pokud globální šablona neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.importToWorld('bad', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertCanManage('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertCanManage('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.assertCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });
});
