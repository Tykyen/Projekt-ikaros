import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UniverseService } from './universe.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { UniverseMap } from './interfaces/universe-map.interface';

const mockMap: UniverseMap = {
  id: 'map1',
  worldId: 'world1',
  nodes: [
    { id: 'Midgard', name: 'Midgard', color: '#ffffff', size: 8, isPublic: true, visibleToPlayerIds: [] },
    { id: 'Asgard', name: 'Asgard', color: '#ffee00', size: 6, isPublic: false, visibleToPlayerIds: ['player1'] },
    { id: 'Niflheim', name: 'Niflheim', color: '#00bfff', size: 6, isPublic: false, visibleToPlayerIds: [] },
  ],
  links: [
    { source: 'Midgard', target: 'Asgard', isOrbit: false },
    { source: 'Midgard', target: 'Niflheim', isOrbit: false },
    { source: 'Asgard', target: 'Niflheim', isOrbit: false },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UniverseService', () => {
  let service: UniverseService;
  const mockRepo = {
    findByWorld: jest.fn(),
    upsert: jest.fn(),
    updateNodeVisibility: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UniverseService,
        { provide: 'IUniverseRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(UniverseService);
  });

  describe('findByWorld', () => {
    it('vrátí existující mapu', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', null, false);
      expect(result).toBeDefined();
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });

    it('vrátí prázdnou mapu pro neexistující svět (ne Matrix)', async () => {
      mockRepo.findByWorld.mockResolvedValue(null);
      mockRepo.upsert.mockResolvedValue({ ...mockMap, nodes: [], links: [] });
      const result = await service.findByWorld('other-world', null, false);
      expect(result.nodes).toHaveLength(0);
      expect(mockRepo.upsert).toHaveBeenCalledWith('other-world', [], []);
    });
  });

  describe('visibility filtr', () => {
    it('PJ vidí všechny uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', 'pj1', true);
      expect(result.nodes).toHaveLength(3);
      expect(result.links).toHaveLength(3);
    });

    it('hráč vidí jen isPublic=true uzly a uzly kde je v visibleToPlayerIds', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', 'player1', false);
      // Midgard (isPublic) + Asgard (player1 v visibleToPlayerIds)
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['Midgard', 'Asgard']));
    });

    it('hráč nevidí uzly kde není ani isPublic ani v visibleToPlayerIds', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', 'player2', false);
      // jen Midgard (isPublic)
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('Midgard');
    });

    it('filtruje linky na skryté uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', 'player2', false);
      // player2 vidí jen Midgard → žádný link není platný (Asgard a Niflheim skryté)
      expect(result.links).toHaveLength(0);
    });

    it('anon uživatel (null userId) vidí jen isPublic uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', null, false);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('Midgard');
    });
  });

  describe('update', () => {
    it('uloží celou mapu a vrátí výsledek', async () => {
      mockRepo.upsert.mockResolvedValue(mockMap);
      const result = await service.update('world1', { nodes: mockMap.nodes, links: mockMap.links });
      expect(mockRepo.upsert).toHaveBeenCalledWith('world1', mockMap.nodes, mockMap.links);
      expect(result).toBeDefined();
    });
  });

  describe('updateNodeVisibility', () => {
    it('vrátí aktualizovanou mapu při úspěchu', async () => {
      mockRepo.updateNodeVisibility.mockResolvedValue(mockMap);
      const result = await service.updateNodeVisibility('world1', 'Midgard', { isPublic: false, visibleToPlayerIds: ['p1'] });
      expect(result).toBeDefined();
    });

    it('vyhodí NotFoundException pokud nodeId neexistuje', async () => {
      mockRepo.updateNodeVisibility.mockResolvedValue(null);
      await expect(
        service.updateNodeVisibility('world1', 'NEEXISTUJE', { isPublic: true, visibleToPlayerIds: [] }),
      ).rejects.toThrow(NotFoundException);
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
