import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PagesService } from './pages.service';
import { TipTapExtractor } from './tiptap-extractor.service';
import { CharactersService } from '../characters/characters.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

// Elevovaný admin (world elevation aktivní pro world1) — drží admin bypass
// po zavedení worldAdminBypass. De-elevated admin testy mají vlastní requester.
const adminRequester = {
  id: 'admin',
  role: UserRole.Admin,
  elevatedWorldIds: ['world1'],
};
const deElevatedAdminRequester = { id: 'admin', role: UserRole.Admin };
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
    // D-SEC-GAP-2026-07-11 — creation-flood cap; default hluboko pod stropem.
    countByWorld: jest.fn().mockResolvedValue(0),
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
  };
  const mockSettingsRepo = { findByWorldId: jest.fn() };
  // 9.1 / Spec 9.2 — CharactersService mock pro auto-create Character při
  // Page typu PostavaHrace/NPC/Lokace. Default mock vrací validní character,
  // ať testy s `type: 'Lokace'` nepadnou na undefined.id.
  const mockCharactersService = {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'mock-char-1', slug: 'mock', kind: 'persona' }),
    delete: jest.fn(),
    // D-SEC-GAP (slug kolize diakritiky) — ensureAvailableSlug kontroluje
    // i characters kolekci; default = volno.
    existsBySlug: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCharactersService.create.mockResolvedValue({
      id: 'mock-char-1',
      slug: 'mock',
      kind: 'persona',
    });
    mockCharactersService.existsBySlug.mockResolvedValue(false);
    // D-SEC-GAP-2026-07-11 — default pod stropem (testy capu si přepíšou).
    mockPagesRepo.countByWorld.mockResolvedValue(0);
    // RC-D2 — assertCanWrite nově ověřuje, že svět je aktivní. Default = živý
    // svět (jednotlivé testy si ho přepisují na null / soft-smazaný dle potřeby).
    mockWorldsRepo.findById.mockResolvedValue({
      id: 'world1',
      isActive: true,
      deletedAt: null,
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
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), emitAsync: jest.fn() },
        },
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

    it('platform Superadmin S ELEVACÍ obejde AKJ i bez membershipu ve světě', async () => {
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
        ['world1'],
      );
      expect(result.id).toBe('page1');
    });

    it('platform Superadmin BEZ ELEVACE nemá AKJ bypass → 403 (R-20)', async () => {
      const restricted = {
        ...mockPage,
        accessRequirements: [{ type: 'AKJ', value: '8' }],
      };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findBySlug(
          'hlavni-lokace',
          'world1',
          'superadmin',
          UserRole.Superadmin,
          // bez elevace (žádný / cizí svět)
          ['jiny-svet'],
        ),
      ).rejects.toThrow(ForbiddenException);
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

  describe('create — D-SEC-GAP-2026-07-11 creation-flood cap', () => {
    it('2000 stránek ve světě → 409 LIMIT_REACHED (nic se nezapíše)', async () => {
      mockPagesRepo.countByWorld.mockResolvedValue(2000);
      await expect(
        service.create(
          { slug: 'flood', type: 'Lokace', title: 'Flood' },
          'world1',
          adminRequester,
        ),
      ).rejects.toMatchObject({ response: { code: 'LIMIT_REACHED' } });
      expect(mockPagesRepo.save).not.toHaveBeenCalled();
      expect(mockCharactersService.create).not.toHaveBeenCalled();
    });

    it('pod stropem (1999) → create projde', async () => {
      mockPagesRepo.countByWorld.mockResolvedValue(1999);
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockResolvedValue({ ...mockPage, slug: 'pod-capem' });
      await expect(
        service.create(
          { slug: 'pod-capem', type: 'Lokace', title: 'X' },
          'world1',
          adminRequester,
        ),
      ).resolves.toBeDefined();
    });

    it('env MAX_PAGES_PER_WORLD přepíše default', async () => {
      process.env.MAX_PAGES_PER_WORLD = '5';
      try {
        mockPagesRepo.countByWorld.mockResolvedValue(5);
        await expect(
          service.create(
            { slug: 'env-cap', type: 'Lokace', title: 'X' },
            'world1',
            adminRequester,
          ),
        ).rejects.toMatchObject({ response: { code: 'LIMIT_REACHED' } });
      } finally {
        delete process.env.MAX_PAGES_PER_WORLD;
      }
    });
  });

  describe('create', () => {
    // FIX-21 — kolize slugu (jiná stránka NEBO reserved world route) se dřív
    // řešila 409 reject; teď auto-suffix (`mapa` → `mapa-2` ...), aby stránka
    // zůstala dosažitelná. Jméno (title) se nemění, jen skrytý slug.
    it('FIX-21 — auto-suffixuje slug, když v světě už existuje (ne reject)', async () => {
      mockPagesRepo.existsBySlugAndWorld
        .mockResolvedValueOnce(true) // 'hlavni-lokace' obsazený
        .mockResolvedValueOnce(false); // 'hlavni-lokace-2' volný
      mockPagesRepo.save.mockResolvedValue({
        ...mockPage,
        slug: 'hlavni-lokace-2',
      });
      await service.create(
        { slug: 'hlavni-lokace', type: 'Lokace', title: 'X' },
        'world1',
        adminRequester,
      );
      expect(mockPagesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'hlavni-lokace-2' }),
      );
    });

    it('FIX-21 — auto-suffixuje slug shodný s reserved world route (mapa → mapa-2)', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockResolvedValue({ ...mockPage, slug: 'mapa-2' });
      await service.create(
        { slug: 'mapa', type: 'Lokace', title: 'Mapa pokladu' },
        'world1',
        adminRequester,
      );
      expect(mockPagesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'mapa-2' }),
      );
    });

    // D-SEC-GAP (slug kolize diakritiky) — „Šíp" i „Sip" dají po slugify
    // stejný slug `sip`. Persona/Lokace page tvoří Character se stejným
    // slugem ({worldId, slug} unique v characters) → kolize s existující
    // postavou (osiřelou / vytvořenou přímým POST /characters) musí dostat
    // suffix už při volbě page slugu, ne 409 CHARACTER_SLUG_TAKEN.
    it('D-SEC-GAP — auto-suffixuje slug obsazený postavou v characters kolekci', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockCharactersService.existsBySlug
        .mockResolvedValueOnce(true) // 'sip' drží existující Character
        .mockResolvedValueOnce(false); // 'sip-2' volný
      mockPagesRepo.save.mockResolvedValue({ ...mockPage, slug: 'sip-2' });
      await service.create(
        { slug: 'sip', type: 'NPC', title: 'Šíp' },
        'world1',
        adminRequester,
      );
      expect(mockPagesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'sip-2' }),
      );
      // Character se tvoří se STEJNÝM (suffixovaným) slugem — invariant
      // page.slug == character.slug.
      expect(mockCharactersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'sip-2' }),
        'world1',
      );
    });

    it('FIX-21 — vyhodí ConflictException, pokud se do 500 pokusů nenajde volný slug (safety cap)', async () => {
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
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        isActive: true,
        deletedAt: null,
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create(
          { slug: 'a', type: 'Lokace', title: 'X' },
          'world1',
          hracRequester,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('15.11 — Hrac navrhující NE-whitelist typ (Noviny) → Forbidden', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        isActive: true,
        deletedAt: null,
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      await expect(
        service.create(
          { slug: 'a', type: 'Noviny', title: 'X' },
          'world1',
          hracRequester,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('15.11 — Hrac navrhující whitelist typ (Lokace) → pending návrh (proposedBy=autor)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        isActive: true,
        deletedAt: null,
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockResolvedValue({
        ...mockPage,
        pageStatus: 'pending',
      });
      await service.create(
        { slug: 'a', type: 'Lokace', title: 'X' },
        'world1',
        hracRequester,
      );
      expect(mockPagesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ pageStatus: 'pending', proposedBy: 'user1' }),
      );
    });

    it('15.11 — Čtenář (role < Hráč) i na whitelist typ → Forbidden', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Ctenar,
      });
      await expect(
        service.create(
          { slug: 'a', type: 'NPC', title: 'X' },
          'world1',
          hracRequester,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('15.11 — moderátor (PomocnyPJ) tvoří whitelist typ rovnou approved', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockResolvedValue(mockPage);
      await service.create(
        { slug: 'a', type: 'NPC', title: 'X' },
        'world1',
        hracRequester,
      );
      expect(mockPagesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ pageStatus: 'approved' }),
      );
    });

    it('PomocnyPJ může vytvořit stránku', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        isActive: true,
        deletedAt: null,
      });
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

    it('platform Admin BEZ ELEVACE nemá write bypass → Forbidden (R-20)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        isActive: true,
        deletedAt: null,
      });
      // de-elevated admin = žádný membership → chová se jako nečlen
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create(
          { slug: 'a', type: 'Lokace', title: 'X' },
          'world1',
          deElevatedAdminRequester,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DI-04 — rollback Character když page save selže (persona, child-first)', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockCharactersService.create.mockResolvedValue({
        id: 'char-x',
        slug: 'rollback-test',
        kind: 'persona',
      });
      mockPagesRepo.save.mockRejectedValue(new Error('db write failed'));
      await expect(
        service.create(
          { slug: 'rollback-test', type: 'NPC', title: 'X' },
          'world1',
          adminRequester,
        ),
      ).rejects.toThrow('db write failed');
      // postava vytvořená TEĎ se musí vrátit zpět (charactersService.delete)
      expect(mockCharactersService.delete).toHaveBeenCalledWith(
        'rollback-test',
        'world1',
      );
    });

    it('DI-04 — když je characterRef předán (migrace), nic se nemaže při pádu', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockRejectedValue(new Error('db write failed'));
      await expect(
        service.create(
          {
            slug: 'with-ref',
            type: 'NPC',
            title: 'X',
            characterRef: { characterId: 'existing-1' },
          },
          'world1',
          adminRequester,
        ),
      ).rejects.toThrow('db write failed');
      expect(mockCharactersService.delete).not.toHaveBeenCalled();
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

  describe('update — FIX-21 slug rename', () => {
    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        isActive: true,
        deletedAt: null,
      });
      mockPagesRepo.findById.mockResolvedValue({ ...mockPage });
    });

    it('beze změny slugu (stejná hodnota) nevolá existsBySlugAndWorld', async () => {
      mockPagesRepo.update.mockResolvedValue({ ...mockPage });
      await service.update(
        'page1',
        'world1',
        { slug: 'hlavni-lokace', title: 'Přejmenováno' },
        adminRequester,
      );
      expect(mockPagesRepo.existsBySlugAndWorld).not.toHaveBeenCalled();
    });

    it('auto-suffixuje nový slug, který koliduje s jinou stránkou', async () => {
      mockPagesRepo.existsBySlugAndWorld
        .mockResolvedValueOnce(true) // 'obsazeny' obsazený
        .mockResolvedValueOnce(false); // 'obsazeny-2' volný
      mockPagesRepo.update.mockResolvedValue({
        ...mockPage,
        slug: 'obsazeny-2',
      });
      await service.update(
        'page1',
        'world1',
        { slug: 'obsazeny' },
        adminRequester,
      );
      expect(mockPagesRepo.update).toHaveBeenCalledWith(
        'page1',
        expect.objectContaining({ slug: 'obsazeny-2' }),
      );
    });

    it('auto-suffixuje nový slug shodný s reserved world route', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.update.mockResolvedValue({ ...mockPage, slug: 'chat-2' });
      await service.update('page1', 'world1', { slug: 'chat' }, adminRequester);
      expect(mockPagesRepo.update).toHaveBeenCalledWith(
        'page1',
        expect.objectContaining({ slug: 'chat-2' }),
      );
    });
  });

  describe('15.11 — návrhy obsahu: viditelnost pending + editace', () => {
    it('pending návrh: cizí hráč dostane 404 (skryje existenci)', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        pageStatus: 'pending',
        proposedBy: 'author-x',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      await expect(
        service.findBySlug('hlavni-lokace', 'world1', 'user1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('pending návrh: autor svůj návrh vidí', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        pageStatus: 'pending',
        proposedBy: 'user1',
      });
      const result = await service.findBySlug(
        'hlavni-lokace',
        'world1',
        'user1',
      );
      expect(result.id).toBe('page1');
    });

    it('pending návrh: moderátor (PomocnyPJ) vidí', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        pageStatus: 'pending',
        proposedBy: 'author-x',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      const result = await service.findBySlug(
        'hlavni-lokace',
        'world1',
        'user1',
      );
      expect(result.id).toBe('page1');
    });

    it('adresář: pending návrh cizí hráč nevidí, approved ano', async () => {
      mockPagesRepo.findDirectory = jest.fn().mockResolvedValue([
        {
          id: 'p1',
          slug: 'a',
          title: 'A',
          type: 'NPC',
          order: 0,
          pageStatus: 'approved',
        },
        {
          id: 'p2',
          slug: 'b',
          title: 'B',
          type: 'NPC',
          order: 1,
          pageStatus: 'pending',
          proposedBy: 'author-x',
        },
      ]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      const result = await service.findDirectory(
        'world1',
        undefined,
        'user1',
        UserRole.Hrac,
      );
      expect(result.map((r) => r.slug)).toEqual(['a']);
    });

    it('adresář: moderátor vidí i pending návrh', async () => {
      mockPagesRepo.findDirectory = jest.fn().mockResolvedValue([
        {
          id: 'p1',
          slug: 'a',
          title: 'A',
          type: 'NPC',
          order: 0,
          pageStatus: 'approved',
        },
        {
          id: 'p2',
          slug: 'b',
          title: 'B',
          type: 'NPC',
          order: 1,
          pageStatus: 'pending',
          proposedBy: 'author-x',
        },
      ]);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      const result = await service.findDirectory(
        'world1',
        undefined,
        'user1',
        UserRole.Hrac,
      );
      expect(result.map((r) => r.slug).sort()).toEqual(['a', 'b']);
    });

    it('autor smí editovat svůj pending návrh', async () => {
      mockPagesRepo.findById.mockResolvedValue({
        ...mockPage,
        type: 'NPC',
        pageStatus: 'pending',
        proposedBy: 'user1',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      mockPagesRepo.update.mockResolvedValue({ ...mockPage });
      await expect(
        service.update('page1', 'world1', { title: 'Doladěno' }, hracRequester),
      ).resolves.toBeDefined();
    });

    it('cizí hráč NEsmí editovat cizí pending návrh → Forbidden', async () => {
      mockPagesRepo.findById.mockResolvedValue({
        ...mockPage,
        type: 'NPC',
        pageStatus: 'pending',
        proposedBy: 'author-x',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      await expect(
        service.update('page1', 'world1', { title: 'X' }, hracRequester),
      ).rejects.toThrow(ForbiddenException);
    });

    // Vlastník své approved postavy hráče smí editovat Bio (fix: FE mu tlačítko
    // „Upravit Bio" ukazuje, BE dřív 403 → „Uložení selhalo").
    it('vlastník approved PC (role Hráč) smí editovat vlastní stránku', async () => {
      mockPagesRepo.findById.mockResolvedValue({
        ...mockPage,
        type: 'Postava hráče',
        pageStatus: 'approved',
        ownerUserId: 'user1',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      mockPagesRepo.update.mockResolvedValue({ ...mockPage });
      await expect(
        service.update('page1', 'world1', { title: 'Nové bio' }, hracRequester),
      ).resolves.toBeDefined();
    });

    // Vlastník (ne-moderátor) NESMÍ přes editaci eskalovat práva — citlivá pole
    // se osekají a do patch se nedostanou.
    it('vlastník PC: citlivá pole (accessRequirements/akjTabs/ownerUserId/type/slug) se osekají', async () => {
      mockPagesRepo.findById.mockResolvedValue({
        ...mockPage,
        type: 'Postava hráče',
        pageStatus: 'approved',
        ownerUserId: 'user1',
        // characterRef přítomen → update nespouští tvorbu Character entity.
        characterRef: { characterId: 'c1' },
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      let patchArg: Record<string, unknown> | undefined;
      mockPagesRepo.update.mockImplementation(
        (_id: string, p: Record<string, unknown>) => {
          patchArg = p;
          return Promise.resolve({ ...mockPage });
        },
      );
      await service.update(
        'page1',
        'world1',
        {
          title: 'Nové bio',
          accessRequirements: [{ type: 'Role', value: '0' }],
          akjTabs: [{ id: 'x', name: 'Hack', order: 0, access: [] }],
          ownerUserId: 'nekdo-jiny',
          type: 'NPC',
          slug: 'ukradeny-slug',
        } as never,
        hracRequester,
      );
      expect(patchArg).toBeDefined();
      expect(patchArg?.accessRequirements).toBeUndefined();
      expect(patchArg?.akjTabs).toBeUndefined();
      expect(patchArg?.ownerUserId).not.toBe('nekdo-jiny');
      expect(patchArg?.slug).toBeUndefined();
    });

    // Moderátor citlivá pole měnit smí (kontrast k vlastníkovi).
    it('moderátor (PomocnyPJ) citlivá pole měnit smí', async () => {
      mockPagesRepo.findById.mockResolvedValue({
        ...mockPage,
        type: 'Ostatní',
        pageStatus: 'approved',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      let patchArg: Record<string, unknown> | undefined;
      mockPagesRepo.update.mockImplementation(
        (_id: string, p: Record<string, unknown>) => {
          patchArg = p;
          return Promise.resolve({ ...mockPage });
        },
      );
      await service.update(
        'page1',
        'world1',
        { accessRequirements: [{ type: 'Role', value: '2' }] } as never,
        hracRequester,
      );
      expect(patchArg?.accessRequirements).toEqual([
        { type: 'Role', value: '2' },
      ]);
    });

    it('cizí hráč NEsmí editovat cizí approved PC → Forbidden', async () => {
      mockPagesRepo.findById.mockResolvedValue({
        ...mockPage,
        type: 'Postava hráče',
        pageStatus: 'approved',
        ownerUserId: 'nekdo-jiny',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      await expect(
        service.update('page1', 'world1', { title: 'X' }, hracRequester),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('15.11 — schvalování návrhů (approve / reject)', () => {
    it('approveProposal: pending → approved (moderátor)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        pageStatus: 'pending',
        proposedBy: 'author-x',
      });
      mockPagesRepo.update.mockResolvedValue({
        ...mockPage,
        pageStatus: 'approved',
      });
      const result = await service.approveProposal(
        'world1',
        'hlavni-lokace',
        hracRequester,
      );
      expect(mockPagesRepo.update).toHaveBeenCalledWith('page1', {
        pageStatus: 'approved',
      });
      expect(result.pageStatus).toBe('approved');
    });

    it('approveProposal: stránka není pending → 404', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        pageStatus: 'approved',
      });
      await expect(
        service.approveProposal('world1', 'x', hracRequester),
      ).rejects.toThrow(NotFoundException);
    });

    it('approveProposal: non-moderátor (Hrac) → Forbidden', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.Hrac,
      });
      await expect(
        service.approveProposal('world1', 'x', hracRequester),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejectProposal discard: smaže stránku', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        pageStatus: 'pending',
        proposedBy: 'author-x',
      });
      mockPagesRepo.findById.mockResolvedValue({
        ...mockPage,
        pageStatus: 'pending',
      });
      mockPagesRepo.delete.mockResolvedValue(true);
      await service.rejectProposal(
        'world1',
        'hlavni-lokace',
        'discard',
        hracRequester,
      );
      expect(mockPagesRepo.delete).toHaveBeenCalledWith('page1');
    });

    it('rejectProposal rework: stránku nesmaže (zůstane pending)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        role: WorldRole.PomocnyPJ,
      });
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockPage,
        pageStatus: 'pending',
        proposedBy: 'author-x',
      });
      const result = await service.rejectProposal(
        'world1',
        'hlavni-lokace',
        'rework',
        hracRequester,
      );
      expect(mockPagesRepo.delete).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
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
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        isActive: true,
        deletedAt: null,
      });
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

    // D-DATA-SYNC-ZBYTKY a — characterId v directory entry (FE migrace
    // z legacy characters directory). entry.id zůstává page ID.
    it('entry postavy nese characterId, čistá stránka null', async () => {
      mockPagesRepo.findDirectory = jest.fn().mockResolvedValue([
        {
          id: 'p1',
          slug: 'gandalf',
          title: 'Gandalf',
          type: 'PostavaHrace',
          order: 0,
          characterId: 'char1',
        },
        {
          id: 'p2',
          slug: 'lokace',
          title: 'Lokace',
          type: 'Lokace',
          order: 1,
          characterId: null,
        },
      ]);
      const result = await service.findDirectory('world1', undefined, 'u1');
      expect(result[0].id).toBe('p1'); // id = page ID, ne characterId
      expect(result[0].characterId).toBe('char1');
      expect(result[1].characterId).toBeNull();
    });

    // D-DATA-SYNC-ZBYTKY a — guard parita s legacy characters directory:
    // OptionalJwt → anonym (bez userId) smí VEŘEJNÝ svět, privátní jen členové.
    describe('world-view brána (anonym / člen × veřejný / privátní)', () => {
      beforeEach(() => {
        mockPagesRepo.findDirectory = jest.fn().mockResolvedValue([]);
      });

      it('anonym + veřejný svět → projde', async () => {
        mockWorldsRepo.findById.mockResolvedValue({
          id: 'world1',
          accessMode: 'public',
        });
        await expect(service.findDirectory('world1')).resolves.toEqual([]);
      });

      it('anonym + privátní svět → ForbiddenException', async () => {
        mockWorldsRepo.findById.mockResolvedValue({
          id: 'world1',
          accessMode: 'private',
        });
        await expect(service.findDirectory('world1')).rejects.toThrow(
          ForbiddenException,
        );
        // Membership lookup se pro anonyma vůbec nevolá.
        expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
      });

      it('anonym + neexistující svět → NotFoundException', async () => {
        mockWorldsRepo.findById.mockResolvedValue(null);
        await expect(service.findDirectory('world1')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('člen + privátní svět → projde', async () => {
        mockWorldsRepo.findById.mockResolvedValue({
          id: 'world1',
          accessMode: 'private',
        });
        mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
        await expect(
          service.findDirectory('world1', undefined, 'user1', UserRole.Hrac),
        ).resolves.toEqual([]);
      });

      it('přihlášený nečlen + privátní svět → ForbiddenException (R-AUDIT)', async () => {
        mockWorldsRepo.findById.mockResolvedValue({
          id: 'world1',
          accessMode: 'private',
        });
        mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
        await expect(
          service.findDirectory('world1', undefined, 'cizak', UserRole.Hrac),
        ).rejects.toThrow(ForbiddenException);
      });
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
      const result = await service.findRandom('world1', 5, 'user1');
      expect(mockPagesRepo.findRandom).toHaveBeenCalledWith('world1', 5);
      expect(result).toHaveLength(1);
    });

    it('nečlen privátního světa → ForbiddenException (IDOR fix)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        isActive: true,
        deletedAt: null,
        accessMode: 'private',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockPagesRepo.findRandom = jest.fn().mockResolvedValue([mockPage]);
      await expect(service.findRandom('world1', 5, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
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

    it('platform Superadmin S ELEVACÍ vidí vše odemčené i bez membershipu', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.findBySlug(
        'kral',
        'world1',
        'super',
        UserRole.Superadmin,
        ['world1'],
      );
      expect(result.akjTabs?.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
      expect(result.akjTabs?.every((t) => t.locked === false)).toBe(true);
    });

    it('platform Superadmin BEZ ELEVACE nevidí vše odemčené (R-20)', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(kral);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.findBySlug(
        'kral',
        'world1',
        'super',
        UserRole.Superadmin,
        // žádná elevace pro world1
        [],
      );
      // Bez elevace = chová se jako nečlen: NEvidí všechny záložky odemčené.
      expect(result.akjTabs?.every((t) => t.locked === false)).toBe(false);
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

    // error-contract — `locked` je read-time enrich (server zámek); klient ho
    // posílá zpět, ale do DB nepatří. sanitizeAkjTabs ho musí zahodit.
    it('zahodí read-only pole `locked` z akjTabs (neukládá se)', async () => {
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
            { id: 't1', name: 'Dvůr', order: 0, access: [], locked: true },
          ],
        } as never,
        'world1',
        adminRequester,
      );
      const tabs = savedArg?.akjTabs as Array<Record<string, unknown>>;
      expect(tabs[0]).not.toHaveProperty('locked');
      expect(tabs[0].id).toBe('t1');
    });

    // N-RUN-08-02 (plný audit, styl 36) — stored XSS přes TYPE-CONFUSION.
    // `customData` je `Record<string,string>` jen v TS; DTO má pouhé
    // `@IsObject()`. Dřív se sanitizovala jen string-větev (`typeof === 'string'
    // ? sanitize : value`), takže pole/objekt prošly RAW až do FE
    // `NovinyLayout` → `dangerouslySetInnerHTML` = XSS u každého diváka.
    // Sanitizace nesmí mít větev, kterou lze obejít volbou typu.
    it('N-RUN-08-02 — ne-string `customData` NEobejde sanitizaci (XSS)', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      let savedArg: Record<string, unknown> | undefined;
      mockPagesRepo.save.mockImplementation((p: Record<string, unknown>) => {
        savedArg = p;
        return Promise.resolve({ ...mockPage, ...p });
      });

      await service.create(
        {
          slug: 'noviny',
          type: 'Ostatní',
          title: 'Noviny',
          customData: {
            // pole → `typeof !== 'string'` → dřív se uložilo raw
            Stat: ['<img src=x onerror=alert(1)>'],
            // objekt → totéž
            Mesto: { toString: undefined, evil: '<script>alert(1)</script>' },
            // string větev musí fungovat dál
            Vladce: '<b>Aragorn</b><script>alert(1)</script>',
          },
        } as never,
        'world1',
        adminRequester,
      );

      const cd = savedArg?.customData as Record<string, string>;
      // Žádná hodnota nesmí nést spustitelný payload.
      for (const value of Object.values(cd)) {
        expect(typeof value).toBe('string');
        expect(value).not.toContain('<script>');
        expect(value).not.toContain('onerror');
      }
      // Neškodné HTML ve string větvi zůstává (sanitizace ≠ mazání všeho).
      expect(cd.Vladce).toContain('Aragorn');
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
