import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CharactersService } from './characters.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

// 9.1 (cleanup) — Character drží jen subdoc data; bio polí (publicBio,
// privateBio, etc.) jsou v Page entity. PublicView neukáže userId/diaryData;
// plná Character (PJ/owner) ano.
const mockCharacter = {
  id: 'char1',
  slug: 'medak',
  name: 'Měďák',
  worldId: 'world1',
  userId: 'user1',
  isNpc: false,
  diaryData: {},
  extraBlocks: [],
  customData: {},
  createdAt: new Date(),
};

const mockNpc = {
  ...mockCharacter,
  id: 'char2',
  slug: 'agent-smith',
  name: 'Agent Smith',
  userId: undefined,
  isNpc: true,
};

const mockMembership = {
  id: 'mem1',
  userId: 'user1',
  worldId: 'world1',
  role: WorldRole.Hrac,
  akj: 5,
  joinedAt: new Date(),
};
const mockPjMembership = { ...mockMembership, role: WorldRole.PJ };
const mockPomocnyPjMembership = {
  ...mockMembership,
  role: WorldRole.PomocnyPJ,
};

describe('CharactersService', () => {
  let service: CharactersService;
  const mockCharRepo = {
    findById: jest.fn(),
    findBySlugAndWorld: jest.fn(),
    findByWorld: jest.fn(),
    findByUserAndWorld: jest.fn(),
    findPlayerCharacters: jest.fn(),
    findDirectory: jest.fn(),
    existsBySlugAndWorld: jest.fn(),
    countByWorld: jest.fn().mockResolvedValue(0),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };
  const mockPagesRepo = {
    findByWorld: jest.fn().mockResolvedValue([]),
  };
  // RC-D2 — assertCanManage nově ověřuje, že svět je aktivní (worldsRepo.findById).
  const mockWorldsRepo = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'world1', isActive: true, deletedAt: null }),
  };
  const mockEventEmitter = {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: 'ICharactersRepository', useValue: mockCharRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    service = module.get(CharactersService);
  });

  // R-02 (role audit) — admin/staff bypass v ekonomice jde přes `isWorldStaff`
  // (world-scoped elevace, ne globální Admin). Tenhle blok je cílená pojistka
  // R-02 (anti-regression-map guard): hlídá, že bypass dostane jen skutečný
  // world-staff (elevovaný Admin pro daný svět / PomocnyPJ+), ne řadový hráč
  // ani de-elevovaný Admin.
  describe('isWorldStaff (world elevation bypass)', () => {
    it('ELEVOVANÝ platform Admin bez membershipu → true (bypass)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      expect(
        await service.isWorldStaff('world1', {
          id: 'admin1',
          role: UserRole.Admin,
          username: 'admin',
          elevatedWorldIds: ['world1'],
        }),
      ).toBe(true);
    });
    it('de-elevated platform Admin (bez elevace pro svět) bez membershipu → false', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      expect(
        await service.isWorldStaff('world1', {
          id: 'admin1',
          role: UserRole.Admin,
          username: 'admin',
        }),
      ).toBe(false);
    });
    it('bez requestera → false (fail-safe)', async () => {
      expect(await service.isWorldStaff('world1')).toBe(false);
    });
    it('hráč (bez staff role) → false', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      expect(
        await service.isWorldStaff('world1', {
          id: 'user1',
          role: UserRole.Hrac,
          username: 'user1',
        }),
      ).toBe(false);
    });
    it('PomocnyPJ membership → true', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockPomocnyPjMembership,
      );
      expect(
        await service.isWorldStaff('world1', {
          id: 'user1',
          role: UserRole.Hrac,
          username: 'user1',
        }),
      ).toBe(true);
    });
  });

  describe('findBySlug', () => {
    // 9.1 — `publicBio`/`privateBio` jsou v Page entity. Tento spec ověřuje
    // jen permission filter: běžný hráč vidí jen CharacterPublicView (bez
    // userId/diaryData/customData); PJ/PomocnyPJ/owner vidí plnou Character.
    it('vrátí jen veřejnou část NPC (bez diaryData) pro běžného hráče', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      const result = await service.findBySlug('agent-smith', 'world1', 'user1');
      expect(result).not.toHaveProperty('diaryData');
      expect(result).not.toHaveProperty('userId');
    });

    it('vrátí plnou postavu PJ pro NPC', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPjMembership);
      const result = await service.findBySlug('agent-smith', 'world1', 'pj1');
      expect(result).toHaveProperty('diaryData');
    });

    it('vrátí plnou postavu přiřazenému hráči CP', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      const result = await service.findBySlug('medak', 'world1', 'user1');
      expect(result).toHaveProperty('diaryData');
    });

    it('vrátí jen veřejnou část CP pro cizího hráče', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        ...mockMembership,
        userId: 'jiny-user',
      });
      const result = await service.findBySlug('medak', 'world1', 'jiny-user');
      expect(result).not.toHaveProperty('diaryData');
    });

    it('vrátí plnou postavu PomocnyPJ (štáb světa)', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockPomocnyPjMembership,
      );
      const result = await service.findBySlug('agent-smith', 'world1', 'pp1');
      expect(result).toHaveProperty('diaryData');
    });

    it('vyhodí NotFoundException pokud postava neexistuje', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(null);
      await expect(
        service.findBySlug('neexistuje', 'world1', 'user1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertSubdocAccess', () => {
    it('povolí PomocnyPJ (štáb světa)', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockPomocnyPjMembership,
      );
      const result = await service.assertSubdocAccess(
        'agent-smith',
        'world1',
        'pp1',
      );
      expect(result.slug).toBe('agent-smith');
    });

    it('povolí vlastníka CP', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      const result = await service.assertSubdocAccess(
        'medak',
        'world1',
        'user1',
      );
      expect(result.slug).toBe('medak');
    });

    it('odepře běžnému hráči (role pod PomocnyPJ)', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      await expect(
        service.assertSubdocAccess('agent-smith', 'world1', 'jiny-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('vyhodí NotFoundException pokud postava neexistuje', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(null);
      await expect(
        service.assertSubdocAccess('neexistuje', 'world1', 'user1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('vyhodí ConflictException pokud slug existuje', async () => {
      mockCharRepo.existsBySlugAndWorld.mockResolvedValue(true);
      await expect(
        service.create(
          { slug: 'medak', name: 'Měďák', isNpc: false },
          'world1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('emituje character.created po vytvoření', async () => {
      mockCharRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockCharRepo.save.mockResolvedValue(mockCharacter);
      await service.create(
        { slug: 'medak', name: 'Měďák', isNpc: false },
        'world1',
      );
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'character.created',
        expect.objectContaining({ characterId: 'char1', isNpc: false }),
      );
    });

    it('vyhodí ForbiddenException při dosažení limitu postav (ABU styl 34)', async () => {
      mockCharRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockCharRepo.countByWorld.mockResolvedValue(5000);
      await expect(
        service.create({ slug: 'novy', name: 'Nový', isNpc: false }, 'world1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockCharRepo.save).not.toHaveBeenCalled();
    });

    // 9.1 (cleanup) — isLocation pole odstraněno; Lokace = PageType, ne Character.
    // Event payload `character.created` taky bez isLocation.
  });

  describe('convert', () => {
    it('CP → NPC: smaže userId, nastaví isNpc=true', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockCharRepo.update.mockResolvedValue({
        ...mockCharacter,
        userId: null,
        isNpc: true,
      });
      await service.convert('medak', 'world1', {});
      // FIX-5 — `null`, ne `undefined`: Mongoose `$set` s `undefined` klíčem
      // hodnotu nezmění (stará userId by v DB zůstala), `null` ji zapíše.
      expect(mockCharRepo.update).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({ userId: null, isNpc: true }),
      );
    });

    it('NPC → CP: nastaví userId, nastaví isNpc=false', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockCharRepo.update.mockResolvedValue({
        ...mockNpc,
        userId: 'user2',
        isNpc: false,
      });
      await service.convert('agent-smith', 'world1', { userId: 'user2' });
      expect(mockCharRepo.update).toHaveBeenCalledWith(
        'char2',
        expect.objectContaining({ userId: 'user2', isNpc: false }),
      );
    });

    it('emituje character.converted', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockCharRepo.update.mockResolvedValue({
        ...mockCharacter,
        userId: undefined,
        isNpc: true,
      });
      await service.convert('medak', 'world1', {});
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'character.converted',
        expect.objectContaining({ characterId: 'char1' }),
      );
    });
  });

  describe('delete', () => {
    it('vyhodí NotFoundException pokud postava neexistuje', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(null);
      await expect(service.delete('neexistuje', 'world1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('smaže postavu a emituje character.deleted se slugem', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      await service.delete('medak', 'world1');
      expect(mockCharRepo.delete).toHaveBeenCalledWith('char1');
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'character.deleted',
        expect.objectContaining({
          characterId: 'char1',
          worldId: 'world1',
          slug: 'medak',
        }),
      );
    });

    // CD-09 (cascade-delete audit) — cascade přes 3 @OnEvent (účty/subdocy/
    // membership) je best-effort: postava je smazána PŘED emitem, takže selhání
    // jednoho listeneru nesmí shodit delete (HTTP 500). Bez try/catch by
    // emitAsync rejectnul a metoda propagovala chybu volajícímu.
    it('CD-09 — cascade selhání listeneru NEshodí delete (best-effort try/catch)', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockEventEmitter.emitAsync.mockRejectedValueOnce(
        new Error('subdocs listener failed'),
      );
      await expect(service.delete('medak', 'world1')).resolves.toBeUndefined();
      // postava se smazala i tak (delete proběhl před emitem)
      expect(mockCharRepo.delete).toHaveBeenCalledWith('char1');
    });
  });

  describe('findByUser', () => {
    it('vlastník dostane plnou postavu (vč. diaryData)', async () => {
      mockCharRepo.findByUserAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.findByUser('user1', 'world1', 'user1');
      expect(result?.slug).toBe('medak');
      expect(result).toHaveProperty('diaryData');
    });
    it('štáb (PomocnyPJ+) dostane plnou postavu', async () => {
      mockCharRepo.findByUserAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        mockPomocnyPjMembership,
      );
      const result = await service.findByUser('user1', 'world1', 'staff1');
      expect(result).toHaveProperty('diaryData');
    });
    it('cizí přihlášený (nečlen/nevlastník) → public view bez deníku (IDOR fix)', async () => {
      mockCharRepo.findByUserAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.findByUser('user1', 'world1', 'stranger');
      expect(result?.slug).toBe('medak');
      expect(result).not.toHaveProperty('diaryData');
      expect(result).not.toHaveProperty('customData');
    });
    it('postava neexistuje → null', async () => {
      mockCharRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.findByUser('user1', 'world1', 'stranger');
      expect(result).toBeNull();
    });
  });

  describe('getPlayerCharacters', () => {
    // Pozn.: filter `kind: { $ne: 'location' }` (vyloučení Lokací 9.2)
    // probíhá v repository Mongo query, ne v service — pokrýt by mohl jen
    // repository integration test (TODO).
    it('vrátí plný PlayerCharacter DTO (id/name/slug/isNpc/userId) — 10.2c-edit-6', async () => {
      const owned = {
        ...mockCharacter,
        id: 'char-a',
        slug: 'aragorn',
        name: 'Aragorn',
        userId: 'user-1',
      };
      const free = {
        ...mockCharacter,
        id: 'char-b',
        slug: 'test-ikaros',
        name: 'Test ikaros',
        userId: undefined,
      };
      mockCharRepo.findPlayerCharacters = jest
        .fn()
        .mockResolvedValue([owned, free]);
      const result = await service.getPlayerCharacters('world1');
      expect(result).toEqual([
        {
          id: 'char-a',
          slug: 'aragorn',
          name: 'Aragorn',
          isNpc: false,
          userId: 'user-1',
        },
        {
          id: 'char-b',
          slug: 'test-ikaros',
          name: 'Test ikaros',
          isNpc: false,
          userId: undefined,
        },
      ]);
      expect(mockCharRepo.findPlayerCharacters).toHaveBeenCalledWith('world1');
    });
  });

  describe('getDirectory', () => {
    it('vrátí directory entries pro svět', async () => {
      const entry = { id: 'c1', slug: 'frodo', name: 'Frodo', isNpc: false };
      mockCharRepo.findDirectory = jest.fn().mockResolvedValue([entry]);
      const result = await service.getDirectory('world1');
      expect(result).toEqual([entry]);
    });
  });

  describe('update diaryData merge', () => {
    it('merguje diaryData — zachová existující klíče, přidá nové', async () => {
      const existingChar = {
        ...mockCharacter,
        diaryData: { hp: 10, mana: 5 },
        extraBlocks: [],
      };
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(existingChar);
      mockCharRepo.update.mockResolvedValue({
        ...existingChar,
        diaryData: { hp: 20, mana: 5 },
      });
      await service.update('medak', 'world1', { diaryData: { hp: 20 } });
      expect(mockCharRepo.update).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({ diaryData: { hp: 20, mana: 5 } }),
      );
    });

    it('extraBlocks se přepíše celé — existující bloky se zahazují', async () => {
      const oldBlock = { key: 'old', label: 'Starý', type: 'text', order: 0 };
      const newBlock = {
        key: 'skills',
        label: 'Dovednosti',
        type: 'tagvalue',
        order: 1,
      };
      const existingChar = {
        ...mockCharacter,
        diaryData: {},
        extraBlocks: [oldBlock],
      };
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(existingChar);
      mockCharRepo.update.mockResolvedValue({
        ...existingChar,
        extraBlocks: [newBlock],
      });
      await service.update('medak', 'world1', { extraBlocks: [newBlock] });
      const callArgs = mockCharRepo.update.mock.calls[0][1] as {
        extraBlocks: unknown[];
      };
      expect(callArgs.extraBlocks).toEqual([newBlock]);
      expect(callArgs.extraBlocks).not.toContainEqual(oldBlock);
    });
  });

  // ── D-073 — Optimistic concurrency ──────────────────────────────
  describe('update — expectedUpdatedAt concurrency (D-073)', () => {
    const NOW = new Date('2026-05-23T10:00:00.000Z');
    const LATER = new Date('2026-05-23T10:05:00.000Z');

    it('match expectedUpdatedAt → update projde', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockCharacter,
        updatedAt: NOW,
      });
      mockCharRepo.update.mockResolvedValue({
        ...mockCharacter,
        updatedAt: LATER,
      });
      await expect(
        service.update('medak', 'world1', {
          name: 'nový',
          expectedUpdatedAt: NOW.toISOString(),
        }),
      ).resolves.toBeDefined();
      // expectedUpdatedAt nesmí proletět do persist DTO
      const callArgs = mockCharRepo.update.mock.calls[0][1] as {
        expectedUpdatedAt?: string;
      };
      expect(callArgs.expectedUpdatedAt).toBeUndefined();
    });

    it('mismatch → 409 ConflictException', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockCharacter,
        updatedAt: LATER,
      });
      await expect(
        service.update('medak', 'world1', {
          name: 'nový',
          expectedUpdatedAt: NOW.toISOString(), // stale token
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CHARACTER_CONFLICT' }),
      });
      expect(mockCharRepo.update).not.toHaveBeenCalled();
    });

    it('bez expectedUpdatedAt → legacy update bez check', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue({
        ...mockCharacter,
        updatedAt: LATER,
      });
      mockCharRepo.update.mockResolvedValue({ ...mockCharacter });
      await expect(
        service.update('medak', 'world1', { name: 'nový' }),
      ).resolves.toBeDefined();
    });
  });
});
