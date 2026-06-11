import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PagesService } from './pages.service';
import { TipTapExtractor } from './tiptap-extractor.service';
import { CharactersService } from '../characters/characters.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const adminRequester = { id: 'admin', role: UserRole.Admin };
const hracRequester = { id: 'user1', role: UserRole.Hrac };

const mockPage = {
  id: 'page1',
  slug: 'hlavni-lokace',
  worldId: 'world1',
  type: 'Lokace',
  title: 'Hlavní lokace',
  content: '<p>text</p>',
  sections: [],
  galleryImages: [],
  videos: [],
  accessRequirements: [],
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMembership = {
  id: 'mem1',
  userId: 'user1',
  worldId: 'world1',
  role: WorldRole.Hrac,
  akj: 5,
  joinedAt: new Date(),
};

describe('PagesService', () => {
  let service: PagesService;
  const mockPagesRepo = {
    findById: jest.fn(),
    findBySlugAndWorld: jest.fn(),
    findByWorld: jest.fn(),
    existsBySlugAndWorld: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findDirectory: jest.fn(),
    findAllSlugs: jest.fn(),
    findRandom: jest.fn(),
    findBySlugs: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };
  const mockWorldsRepo = {
    findById: jest.fn(),
    addFavoriteSlug: jest.fn(),
    removeFavoriteSlug: jest.fn(),
  };
  const mockSettingsRepo = { findByWorldId: jest.fn() };
  // 9.1 / Spec 9.2 — CharactersService mock pro auto-create Character při
  // Page typu PostavaHrace/NPC/Lokace. Default mock vrací validní character,
  // ať testy s `type: 'Lokace'` nepadnou na undefined.id.
  const mockCharactersService = {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'mock-char-1', slug: 'mock', kind: 'persona' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCharactersService.create.mockResolvedValue({
      id: 'mock-char-1',
      slug: 'mock',
      kind: 'persona',
    });
    const module = await Test.createTestingModule({
      providers: [
        PagesService,
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: 'IWorldSettingsRepository', useValue: mockSettingsRepo },
        {
          provide: TipTapExtractor,
          useValue: { extract: jest.fn().mockReturnValue('plain text') },
        },
        { provide: CharactersService, useValue: mockCharactersService },
      ],
    }).compile();
    service = module.get(PagesService);
  });

  describe('findByWorld', () => {
    it('vrátí stránky světa bez filtrování přístupu', async () => {
      mockPagesRepo.findByWorld.mockResolvedValue([mockPage]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockPagesRepo.findByWorld).toHaveBeenCalledWith(
        'world1',
        undefined,
      );
    });
  });

  describe('findBySlug', () => {
    it('vyhodí NotFoundException pokud stránka neexistuje', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(null);
      await expect(
        service.findBySlug('neexistuje', 'world1', 'user1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('vrátí stránku bez accessRequirements pro každého', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(mockPage);
      const result = await service.findBySlug(
        'hlavni-lokace',
        'world1',
        'user1',
      );
      expect(result.id).toBe('page1');
    });

    it('vyhodí ForbiddenException pokud AKJ nestačí', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'AKJ', value: '10' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 5,
      });
      await expect(
        service.findBySlug('hlavni-lokace', 'world1', 'user1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('propustí pokud AKJ stačí', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'AKJ', value: '5' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 5,
      });
      const result = await service.findBySlug(
        'hlavni-lokace',
        'world1',
        'user1',
      );
      expect(result.id).toBe('page1');
    });

    it('propustí pokud UserId odpovídá', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'UserId', value: 'user1' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      const result = await service.findBySlug(
        'hlavni-lokace',
        'world1',
        'user1',
      );
      expect(result.id).toBe('page1');
    });

    // AKJ bypass — PJ se nesmí zamknout ze svého obsahu (spec-akj-pj-bypass).
    it('PomocnyPJ obejde AKJ i bez dostatečné úrovně', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'AKJ', value: '8' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
        akj: 0,
      });
      const result = await service.findBySlug(
        'hlavni-lokace',
        'world1',
        'user1',
      );
      expect(result.id).toBe('page1');
    });

    it('platform Superadmin obejde AKJ i bez membershipu ve světě', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'AKJ', value: '8' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.findBySlug(
        'hlavni-lokace',
        'world1',
        'superadmin',
        UserRole.Superadmin,
      );
      expect(result.id).toBe('page1');
    });

    it('hráč s nedostatečnou úrovní dál dostává 403 (regrese)', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'AKJ', value: '8' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
        akj: 0,
      });
      await expect(
        service.findBySlug('hlavni-lokace', 'world1', 'user1', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('vyhodí ConflictException pokud slug v světě existuje', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(true);
      await expect(
        service.create(
          { slug: 'hlavni-lokace', type: 'Lokace', title: 'X' },
          'world1',
          adminRequester,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('vytvoří stránku se slug lowercase', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockResolvedValue({
        ...mockPage,
        slug: 'hlavni-lokace',
      });
      await service.create(
        { slug: 'Hlavni-Lokace', type: 'Lokace', title: 'X' },
        'world1',
        adminRequester,
      );
      expect(mockPagesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'hlavni-lokace' }),
      );
    });

    it('Hrac bez membership dostane Forbidden (role gating)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'world1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create(
          { slug: 'a', type: 'Lokace', title: 'X' },
          'world1',
          hracRequester,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Hrac s WorldRole.Hrac dostane Forbidden (potřebuje PomocnyPJ+)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'world1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      await expect(
        service.create(
          { slug: 'a', type: 'Lokace', title: 'X' },
          'world1',
          hracRequester,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('PomocnyPJ může vytvořit stránku', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'world1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockResolvedValue(mockPage);
      await expect(
        service.create(
          { slug: 'a', type: 'Lokace', title: 'X' },
          'world1',
          hracRequester,
        ),
      ).resolves.toBeDefined();
    });

    it('neexistující svět vrací 404 (Hrac requester)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(
        service.create(
          { slug: 'a', type: 'Lokace', title: 'X' },
          'cizi-svet',
          hracRequester,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('vyhodí NotFoundException pokud stránka neexistuje', async () => {
      mockPagesRepo.findById.mockResolvedValue(null);
      await expect(
        service.delete('neexistuje', 'world1', adminRequester),
      ).rejects.toThrow(NotFoundException);
    });

    it('vyhodí ForbiddenException pokud stránka patří jinému světu', async () => {
      mockPagesRepo.findById.mockResolvedValue({
        ...mockPage,
        worldId: 'jiny-svet',
      });
      await expect(
        service.delete('page1', 'world1', adminRequester),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Hrac bez membership nemůže mazat (role gating)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'world1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.delete('page1', 'world1', hracRequester),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findDirectory', () => {
    it('vrátí zkrácené stránky bez access filtru', async () => {
      const dirItem = {
        id: 'p1',
        slug: 'lokace',
        title: 'Lokace',
        type: 'Lokace',
        order: 0,
      };
      mockPagesRepo.findDirectory = jest.fn().mockResolvedValue([dirItem]);
      const result = await service.findDirectory('world1');
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('content');
      expect(mockPagesRepo.findDirectory).toHaveBeenCalledWith(
        'world1',
        undefined,
      );
    });

    // D-062c — AKJ stub karty: chráněná stránka dostane shieldedBy, raw
    // accessRequirements se na FE NEvrací (privacy).
    it('chráněná stránka bez přístupu → shieldedBy + bez raw accessRequirements', async () => {
      const protectedItem = {
        id: 'p2',
        slug: 'tajny-spis',
        title: 'Tajný spis',
        type: 'Stranka',
        order: 1,
        accessRequirements: [{ type: 'AKJ', value: '3' }],
        isWoodWide: false,
      };
      mockPagesRepo.findDirectory = jest
        .fn()
        .mockResolvedValue([protectedItem]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ akj: 1 });
      const result = await service.findDirectory('world1', undefined, 'u1');
      expect(result[0]).not.toHaveProperty('accessRequirements');
      expect(result[0].shieldedBy).toEqual([{ type: 'AKJ', level: 3 }]);
    });

    it('chráněná stránka s dostatečným AKJ → shieldedBy undefined', async () => {
      const protectedItem = {
        id: 'p2',
        slug: 'tajny-spis',
        title: 'Tajný spis',
        type: 'Stranka',
        order: 1,
        accessRequirements: [{ type: 'AKJ', value: '3' }],
        isWoodWide: false,
      };
      mockPagesRepo.findDirectory = jest
        .fn()
        .mockResolvedValue([protectedItem]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ akj: 5 });
      const result = await service.findDirectory('world1', undefined, 'u1');
      expect(result[0].shieldedBy).toBeUndefined();
    });
  });

  describe('findAllSlugs (N-37 — gating)', () => {
    beforeEach(() => {
      mockPagesRepo.findAllSlugs = jest
        .fn()
        .mockResolvedValue(['lokace', 'faq']);
    });

    it('platform Admin+ má bypass → vrátí slugy', async () => {
      const result = await service.findAllSlugs('world1', adminRequester);
      expect(result).toEqual(['lokace', 'faq']);
    });

    it('PomocnyPJ člen → vrátí slugy', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      const result = await service.findAllSlugs('world1', hracRequester);
      expect(result).toEqual(['lokace', 'faq']);
    });

    it('hráč (Hrac membership) → Forbidden (N-37 leak fix)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.findAllSlugs('world1', hracRequester),
      ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    });

    it('non-member → Forbidden', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findAllSlugs('world1', hracRequester),
      ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    });
  });

  describe('findRandom', () => {
    it('vrátí N náhodných stránek s default 5', async () => {
      mockPagesRepo.findRandom = jest.fn().mockResolvedValue([mockPage]);
      const result = await service.findRandom('world1', 5);
      expect(mockPagesRepo.findRandom).toHaveBeenCalledWith('world1', 5);
      expect(result).toHaveLength(1);
    });
  });

  describe('findBySlug — AKJType access', () => {
    it('propustí pokud hráč má správnou AKJ skupinu', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'AKJType', value: 'woodwide' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 7,
      });
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        akjTypes: [{ key: 'woodwide', name: 'Wood Wide Web', level: 7 }],
      });
      const result = await service.findBySlug(
        'hlavni-lokace',
        'world1',
        'user1',
      );
      expect(result.id).toBe('page1');
    });

    it('zamítne pokud hráč nemá dostatečný AKJ pro skupinu', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'AKJType', value: 'woodwide' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 5,
      });
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        akjTypes: [{ key: 'woodwide', name: 'Wood Wide Web', level: 7 }],
      });
      await expect(
        service.findBySlug('hlavni-lokace', 'world1', 'user1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // spec-akj-protected-tabs — per-tab gate ve findBySlug
  // spec-akj-locked-tabs-visible (2026-06-11) — clearance (AKJ) záložky se
  // hráči bez přístupu ukážou ZAMČENÉ (jméno + úroveň, bez obsahu); UserId-only
  // a Role záložky zůstávají skryté.
  describe('findBySlug — AKJ chráněné záložky (locked)', () => {
    const kralTabs = [
      {
        id: 't1',
        name: 'Dvůr',
        order: 0,
        access: [{ type: 'AKJ', value: '3' }],
        contentOverride: { content: '<p>tajný dvůr</p>' },
      },
      {
        id: 't2',
        name: 'Královna',
        order: 1,
        // clearance + jmenovitý klíč na téže záložce
        access: [
          { type: 'AKJ', value: '5' },
          { type: 'UserId', value: 'kralovnin-klic' },
        ],
        contentOverride: { content: '<p>tajná královna</p>' },
      },
      {
        id: 't3',
        name: 'Milenka',
        order: 2,
        // jen jmenovitý klíč, žádná clearance → NEbroadcastuje se (skrytá)
        access: [{ type: 'UserId', value: 'sluha' }],
      },
    ];
    const kral = { ...mockPage, accessRequirements: [], akjTabs: kralTabs };

    it('clearance 5 → Dvůr + Královna odemčené, Milenka (UserId) skrytá', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
        akj: 5,
      });
      const result = await service.findBySlug('kral', 'world1', 'user1');
      expect(
        result.akjTabs?.map((t) => ({ id: t.id, locked: t.locked })),
      ).toEqual([
        { id: 't1', locked: false },
        { id: 't2', locked: false },
      ]);
      // odemčená záložka nese obsah
      expect(result.akjTabs?.[1].contentOverride?.content).toContain(
        'královna',
      );
    });

    it('clearance 3 → Dvůr odemčený, Královna ZAMČENÁ (bez obsahu/klíče), Milenka skrytá', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
        akj: 3,
      });
      const result = await service.findBySlug('kral', 'world1', 'user1');
      expect(
        result.akjTabs?.map((t) => ({ id: t.id, locked: t.locked })),
      ).toEqual([
        { id: 't1', locked: false },
        { id: 't2', locked: true },
      ]);
      const locked = result.akjTabs?.find((t) => t.id === 't2');
      // obsah se NEposílá
      expect(locked?.contentOverride).toBeUndefined();
      // jmenovitý klíč (UserId) se NEposílá, zůstane jen clearance pro „úroveň N"
      expect(locked?.access).toEqual([{ type: 'AKJ', value: '5' }]);
    });

    it('UserId grant → Milenka odemčená, clearance záložky zamčené', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
        akj: 0,
      });
      const result = await service.findBySlug('kral', 'world1', 'sluha');
      expect(
        result.akjTabs?.map((t) => ({ id: t.id, locked: t.locked })),
      ).toEqual([
        { id: 't1', locked: true },
        { id: 't2', locked: true },
        { id: 't3', locked: false },
      ]);
    });

    it('hráč bez přístupu → clearance záložky zamčené, UserId-only skrytá', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
        akj: 0,
      });
      const result = await service.findBySlug('kral', 'world1', 'cizinec');
      expect(
        result.akjTabs?.map((t) => ({ id: t.id, locked: t.locked })),
      ).toEqual([
        { id: 't1', locked: true },
        { id: 't2', locked: true },
      ]);
    });

    it('PJ vidí všechny záložky odemčené', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PJ,
        akj: 0,
      });
      const result = await service.findBySlug('kral', 'world1', 'pj');
      expect(
        result.akjTabs?.map((t) => ({ id: t.id, locked: t.locked })),
      ).toEqual([
        { id: 't1', locked: false },
        { id: 't2', locked: false },
        { id: 't3', locked: false },
      ]);
    });

    it('PomocnyPJ NEMÁ auto-bypass — Dvůr odemčený, Královna zamčená', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
        akj: 3,
      });
      const result = await service.findBySlug('kral', 'world1', 'pomocny');
      expect(
        result.akjTabs?.map((t) => ({ id: t.id, locked: t.locked })),
      ).toEqual([
        { id: 't1', locked: false },
        { id: 't2', locked: true },
      ]);
    });

    it('platform Superadmin vidí vše odemčené i bez membershipu', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.findBySlug(
        'kral',
        'world1',
        'super',
        UserRole.Superadmin,
      );
      expect(result.akjTabs?.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
      expect(result.akjTabs?.every((t) => t.locked === false)).toBe(true);
    });
  });

  // spec-akj-owner-visibility — vlastník postavy (page.ownerUserId) vidí AKJ
  // záložky na své PC defaultně; ownerHidden:true mu je odebere.
  describe('findBySlug — vlastník postavy vidí AKJ záložky', () => {
    const pcTabs = [
      // ownerHidden nezadané → vlastník vidí (default)
      { id: 's1', name: 'Soukromé', order: 0, access: [] },
      // ownerHidden:true → jen PJ tým, vlastník NEvidí
      {
        id: 's2',
        name: 'PJ informace',
        order: 1,
        access: [{ type: 'Role', value: String(WorldRole.PomocnyPJ) }],
        ownerHidden: true,
      },
    ];
    const pc = {
      ...mockPage,
      accessRequirements: [],
      ownerUserId: 'hrac-vlastnik',
      akjTabs: pcTabs,
    };

    it('vlastník vidí Soukromé (bez grantu), ne PJ informace (ownerHidden)', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(pc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
        akj: 0,
      });
      const result = await service.findBySlug(
        'alambert',
        'world1',
        'hrac-vlastnik',
      );
      expect(result.akjTabs?.map((t) => t.id)).toEqual(['s1']);
    });

    it('cizí hráč (ne vlastník) bez grantu nevidí nic — žádná owner výjimka', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(pc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
        akj: 0,
      });
      const result = await service.findBySlug(
        'alambert',
        'world1',
        'cizi-hrac',
      );
      expect(result.akjTabs).toEqual([]);
    });
  });

  // spec-akj-protected-tabs — sanitace contentOverride v create
  describe('create — sanitace akjTabs', () => {
    it('odstraní <script> z contentOverride.content', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      let savedArg: Record<string, unknown> | undefined;
      mockPagesRepo.save.mockImplementation((p: Record<string, unknown>) => {
        savedArg = p;
        return Promise.resolve({ ...mockPage, ...p });
      });
      await service.create(
        {
          slug: 'kral',
          type: 'Ostatní',
          title: 'Král',
          akjTabs: [
            {
              id: 't1',
              name: 'Dvůr',
              order: 0,
              access: [],
              contentOverride: {
                content: '<p>ok</p><script>alert(1)</script>',
              },
            },
          ],
        } as never,
        'world1',
        adminRequester,
      );
      const tabs = savedArg?.akjTabs as Array<{
        contentOverride: { content: string };
      }>;
      expect(tabs[0].contentOverride.content).not.toContain('<script>');
      expect(tabs[0].contentOverride.content).toContain('ok');
    });
  });

  // D-062a — shieldedBy meta endpoint
  describe('findMeta — shieldedBy', () => {
    it('stránka bez accessRequirements → shieldedBy undefined', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        accessRequirements: [],
      });
      const result = await service.findMeta('slug', 'world1', 'user1');
      expect(result.shieldedBy).toBeUndefined();
      expect(result.isWoodWide).toBe(false);
    });

    it('user má přístup → shieldedBy undefined (neukazuje info)', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        accessRequirements: [{ type: 'AKJ', value: '3' }],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 5,
      });
      const result = await service.findMeta('slug', 'world1', 'user1');
      expect(result.shieldedBy).toBeUndefined();
    });

    it('AKJ úroveň nestačí → shieldedBy obsahuje AKJ level', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        accessRequirements: [{ type: 'AKJ', value: '3' }],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 1,
      });
      const result = await service.findMeta('slug', 'world1', 'user1');
      expect(result.shieldedBy).toEqual([{ type: 'AKJ', level: 3 }]);
    });

    it('AKJType resolve z worldSettings — label + level', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        accessRequirements: [{ type: 'AKJType', value: 'top-secret' }],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 1,
      });
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        akjTypes: [{ key: 'top-secret', name: 'Tajný spis', level: 5 }],
      });
      const result = await service.findMeta('slug', 'world1', 'user1');
      expect(result.shieldedBy).toEqual([
        {
          type: 'AKJType',
          level: 5,
          akjKey: 'top-secret',
          akjLabel: 'Tajný spis',
        },
      ]);
    });

    it('AKJType s neznámým key → fallback label = key', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        accessRequirements: [{ type: 'AKJType', value: 'zombie-key' }],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 1,
      });
      mockSettingsRepo.findByWorldId.mockResolvedValue({ akjTypes: [] });
      const result = await service.findMeta('slug', 'world1', 'user1');
      expect(result.shieldedBy).toEqual([
        {
          type: 'AKJType',
          level: undefined,
          akjKey: 'zombie-key',
          akjLabel: 'zombie-key',
        },
      ]);
    });

    it('UserId requirement se v shieldedBy neukazuje (privacy)', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        accessRequirements: [
          { type: 'UserId', value: 'other-user' },
          { type: 'AKJ', value: '3' },
        ],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        akj: 1,
      });
      const result = await service.findMeta('slug', 'world1', 'user1');
      expect(result.shieldedBy).toEqual([{ type: 'AKJ', level: 3 }]);
      // Žádný entry s type: 'UserId'
      expect(
        result.shieldedBy?.find(
          (r) => (r as { type: string }).type === 'UserId',
        ),
      ).toBeUndefined();
    });

    it('Role requirement → roleLabel resolved', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        accessRequirements: [{ type: 'Role', value: '4' }],
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: 2,
      });
      const result = await service.findMeta('slug', 'world1', 'user1');
      expect(result.shieldedBy).toEqual([
        { type: 'Role', level: 4, roleLabel: 'Pomocný PJ' },
      ]);
    });
  });
});
