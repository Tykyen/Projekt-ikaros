import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UniverseService } from './universe.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import type { UniverseMap } from './interfaces/universe-map.interface';

const reqUser = (
  id: string,
  role: UserRole,
  elevatedWorldIds?: string[],
): RequestUser => ({ id, role, username: id, elevatedWorldIds });

const mockMap: UniverseMap = {
  id: 'map1',
  worldId: 'world1',
  nodes: [
    {
      id: 'Midgard',
      name: 'Midgard',
      color: '#ffffff',
      size: 8,
      isPublic: true,
      visibleToPlayerIds: [],
    },
    {
      id: 'Asgard',
      name: 'Asgard',
      color: '#ffee00',
      size: 6,
      isPublic: false,
      visibleToPlayerIds: ['player1'],
    },
    {
      id: 'Niflheim',
      name: 'Niflheim',
      color: '#00bfff',
      size: 6,
      isPublic: false,
      visibleToPlayerIds: [],
    },
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
  const mockWorldsRepo = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: public svět → read gate propustí; testy private brány si ho
    // přepíšou na accessMode:'private'.
    mockWorldsRepo.findById.mockResolvedValue({
      id: 'world1',
      accessMode: 'public',
    });
    const module = await Test.createTestingModule({
      providers: [
        UniverseService,
        { provide: 'IUniverseRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
      ],
    }).compile();
    service = module.get(UniverseService);
  });

  describe('findByWorld', () => {
    it('vrátí existující mapu', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', null);
      expect(result).toBeDefined();
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });

    it('vrátí prázdnou mapu pro neexistující svět (ne Matrix)', async () => {
      mockRepo.findByWorld.mockResolvedValue(null);
      mockRepo.upsert.mockResolvedValue({ ...mockMap, nodes: [], links: [] });
      const result = await service.findByWorld('other-world', null);
      expect(result.nodes).toHaveLength(0);
      expect(mockRepo.upsert).toHaveBeenCalledWith('other-world', [], []);
    });

    it('private svět + anon → ForbiddenException (leak fix)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        accessMode: 'private',
      });
      await expect(service.findByWorld('world1', null)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('private svět + přihlášený nečlen → ForbiddenException', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        accessMode: 'private',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findByWorld('world1', reqUser('u1', UserRole.Hrac)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('private svět + člen → projde', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        accessMode: 'private',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld(
        'world1',
        reqUser('player1', UserRole.Hrac),
      );
      expect(result).toBeDefined();
    });
  });

  describe('visibility filtr', () => {
    it('elevovaný Admin vidí všechny uzly (bez membership dotazu)', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld(
        'world1',
        reqUser('admin1', UserRole.Admin, ['world1']),
      );
      expect(result.nodes).toHaveLength(3);
      expect(result.links).toHaveLength(3);
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('de-elevovaný Admin (bez membershipu) vidí jen veřejné uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.findByWorld(
        'world1',
        reqUser('admin1', UserRole.Admin),
      );
      // bez elevace žádný bypass → padá na membership (žádný) → jen isPublic
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('Midgard');
      expect(mockMembershipRepo.findByUserAndWorld).toHaveBeenCalled();
    });

    it('world PJ (globálně Hrac) vidí všechny uzly přes membership [D-034]', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      const result = await service.findByWorld(
        'world1',
        reqUser('pj1', UserRole.Hrac),
      );
      expect(result.nodes).toHaveLength(3);
      expect(result.links).toHaveLength(3);
    });

    it('hráč vidí jen isPublic=true uzly a uzly kde je v visibleToPlayerIds', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      const result = await service.findByWorld(
        'world1',
        reqUser('player1', UserRole.Hrac),
      );
      // Midgard (isPublic) + Asgard (player1 v visibleToPlayerIds)
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map((n) => n.id)).toEqual(
        expect.arrayContaining(['Midgard', 'Asgard']),
      );
    });

    it('hráč nevidí uzly kde není ani isPublic ani v visibleToPlayerIds', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      const result = await service.findByWorld(
        'world1',
        reqUser('player2', UserRole.Hrac),
      );
      // jen Midgard (isPublic)
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('Midgard');
    });

    it('filtruje linky na skryté uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      const result = await service.findByWorld(
        'world1',
        reqUser('player2', UserRole.Hrac),
      );
      // player2 vidí jen Midgard → žádný link není platný (Asgard a Niflheim skryté)
      expect(result.links).toHaveLength(0);
    });

    it('anon uživatel (null requester) vidí jen isPublic uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', null);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('Midgard');
    });
  });

  describe('update', () => {
    it('uloží celou mapu a vrátí výsledek', async () => {
      mockRepo.upsert.mockResolvedValue(mockMap);
      const result = await service.update('world1', {
        nodes: mockMap.nodes,
        links: mockMap.links,
      });
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        mockMap.nodes,
        mockMap.links,
      );
      expect(result).toBeDefined();
    });
  });

  describe('updateNodeVisibility', () => {
    it('vrátí aktualizovanou mapu při úspěchu', async () => {
      mockRepo.updateNodeVisibility.mockResolvedValue(mockMap);
      const result = await service.updateNodeVisibility('world1', 'Midgard', {
        isPublic: false,
        visibleToPlayerIds: ['p1'],
      });
      expect(result).toBeDefined();
    });

    it('vyhodí NotFoundException pokud nodeId neexistuje', async () => {
      mockRepo.updateNodeVisibility.mockResolvedValue(null);
      await expect(
        service.updateNodeVisibility('world1', 'NEEXISTUJE', {
          isPublic: true,
          visibleToPlayerIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanManage', () => {
    it('propustí elevovaného Admina bez kontroly membershipu', async () => {
      await expect(
        service.assertCanManage(
          reqUser('admin1', UserRole.Admin, ['world1']),
          'world1',
        ),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('de-elevovaný Admin nemá bypass → padá na membership (nečlen → 403)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertCanManage(reqUser('admin1', UserRole.Admin), 'world1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.findByUserAndWorld).toHaveBeenCalled();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        service.assertCanManage(reqUser('pj1', UserRole.Hrac), 'world1'),
      ).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertCanManage(reqUser('user1', UserRole.Hrac), 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertCanManage(reqUser('user1', UserRole.Hrac), 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
