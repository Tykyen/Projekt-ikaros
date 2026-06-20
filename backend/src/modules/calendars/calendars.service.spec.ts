import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CalendarsService } from './calendars.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

const mockCalendar = (
  characterId: string,
  color = '#3B82F6',
  isHidden = false,
) => ({
  id: `cal-${characterId}`,
  characterId,
  worldId: 'w1',
  color,
  displaySettings: { isHiddenInAggregate: isHidden },
  events: [{ id: 'e1', title: 'Schůzka', start: '2026-05-10' }],
});

const mockChar = (id: string, slug: string, name: string) => ({
  id,
  slug,
  name,
  worldId: 'w1',
  isNpc: false,
  userId: 'user1',
});

const mkUser = (role: UserRole, id = 'requester1'): RequestUser => ({
  id,
  role,
  username: `user-${id}`,
});

describe('CalendarsService', () => {
  let service: CalendarsService;

  const mockSubdocs = {
    getCalendarsByWorldId: jest.fn(),
    getCalendar: jest.fn(),
    updateCalendar: jest.fn(),
  };
  const mockCharRepo = {
    findByWorld: jest.fn(),
    findBySlugAndWorld: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };
  const mockWorldsRepo = {
    findById: jest.fn(),
  };
  const mockCharsService = {
    assertSubdocAccess: jest.fn(),
    findBySlugRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWorldsRepo.findById.mockResolvedValue({ id: 'w1', slug: 'w1' });
    const module = await Test.createTestingModule({
      providers: [
        CalendarsService,
        { provide: 'CharacterSubdocsService', useValue: mockSubdocs },
        { provide: 'ICharactersRepository', useValue: mockCharRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: 'CharactersService', useValue: mockCharsService },
      ],
    }).compile();
    service = module.get(CalendarsService);
  });

  describe('aggregate', () => {
    it('vrátí sloučené události všech viditelných postav', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockSubdocs.getCalendarsByWorldId.mockResolvedValue([
        mockCalendar('char1', '#FF0000', false),
        mockCalendar('char2', '#00FF00', false),
      ]);
      mockCharRepo.findByWorld.mockResolvedValue([
        mockChar('char1', 'jan', 'Jan Novák'),
        mockChar('char2', 'eva', 'Eva Malá'),
      ]);

      const result = await service.aggregate('w1', mkUser(UserRole.PJ));

      expect(result.characters).toHaveLength(2);
      expect(result.events).toHaveLength(2);
      expect(result.events[0]).toMatchObject({
        characterId: 'char1',
        slug: 'jan',
        name: 'Jan Novák',
        color: '#FF0000',
      });
    });

    it('vyfiltruje postavy s isHiddenInAggregate=true', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockSubdocs.getCalendarsByWorldId.mockResolvedValue([
        mockCalendar('char1', '#FF0000', false),
        mockCalendar('char2', '#00FF00', true),
      ]);
      mockCharRepo.findByWorld.mockResolvedValue([
        mockChar('char1', 'jan', 'Jan Novák'),
        mockChar('char2', 'eva', 'Eva Malá'),
      ]);

      const result = await service.aggregate('w1', mkUser(UserRole.PJ));

      expect(result.characters).toHaveLength(1);
      expect(result.events).toHaveLength(1);
      expect(result.characters[0].characterId).toBe('char1');
    });

    it('vyhodí ForbiddenException pokud requester je Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.aggregate('w1', mkUser(UserRole.PJ)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('vyhodí ForbiddenException pokud requester není členem světa', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.aggregate('w1', mkUser(UserRole.PJ)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Admin shortcut: globální Admin bez membershipu projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockSubdocs.getCalendarsByWorldId.mockResolvedValue([]);
      mockCharRepo.findByWorld.mockResolvedValue([]);

      const result = await service.aggregate('w1', mkUser(UserRole.Admin));

      expect(result.characters).toHaveLength(0);
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('Superadmin shortcut: globální Superadmin bez membershipu projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockSubdocs.getCalendarsByWorldId.mockResolvedValue([]);
      mockCharRepo.findByWorld.mockResolvedValue([]);

      await service.aggregate('w1', mkUser(UserRole.Superadmin));

      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('vyhodí NotFoundException pro neexistující svět (anti-leak)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(
        service.aggregate('fake', mkUser(UserRole.PJ)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSettings', () => {
    it('aktualizuje color a displaySettings — PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockCharsService.findBySlugRaw.mockResolvedValue(
        mockChar('char1', 'jan', 'Jan Novák'),
      );
      mockSubdocs.getCalendar.mockResolvedValue(mockCalendar('char1'));
      mockSubdocs.updateCalendar.mockResolvedValue({
        ...mockCalendar('char1'),
        color: '#AABBCC',
      });

      const result = await service.updateSettings(
        'w1',
        'jan',
        { color: '#AABBCC' },
        mkUser(UserRole.PJ, 'pj1'),
      );

      expect(mockSubdocs.updateCalendar).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({ color: '#AABBCC' }),
      );
      expect(result.color).toBe('#AABBCC');
    });

    it('PomocnyPJ smí updateSettings (per spec 2026-05-06: ≥ PomocnyPJ)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockCharsService.findBySlugRaw.mockResolvedValue(
        mockChar('char1', 'jan', 'Jan Novák'),
      );
      mockSubdocs.getCalendar.mockResolvedValue(mockCalendar('char1'));
      mockSubdocs.updateCalendar.mockResolvedValue({
        ...mockCalendar('char1'),
        color: '#AABBCC',
      });

      const result = await service.updateSettings(
        'w1',
        'jan',
        { color: '#AABBCC' },
        mkUser(UserRole.PJ, 'pp1'),
      );
      expect(result.color).toBe('#AABBCC');
    });

    it('vyhodí ForbiddenException pro Korektor (role 1) — pod PomocnyPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Korektor,
      });
      await expect(
        service.updateSettings(
          'w1',
          'jan',
          { color: '#000' },
          mkUser(UserRole.PJ, 'requester'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Admin shortcut: globální Admin bez membershipu může updateSettings', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockCharsService.findBySlugRaw.mockResolvedValue(
        mockChar('char1', 'jan', 'Jan Novák'),
      );
      mockSubdocs.getCalendar.mockResolvedValue(mockCalendar('char1'));
      mockSubdocs.updateCalendar.mockResolvedValue({
        ...mockCalendar('char1'),
        color: '#AABBCC',
      });

      await service.updateSettings(
        'w1',
        'jan',
        { color: '#AABBCC' },
        mkUser(UserRole.Admin, 'admin1'),
      );
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('vyhodí NotFoundException pro neexistující slug (přes findBySlugRaw)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockCharsService.findBySlugRaw.mockRejectedValue(
        new NotFoundException('Postava nenalezena'),
      );
      await expect(
        service.updateSettings(
          'w1',
          'neexistuje',
          { color: '#000' },
          mkUser(UserRole.PJ),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('cross-world: PJ světa W1 nesmí updateSettings ve světě W2 → 403', async () => {
      // PJ has W1 membership, ale request je pro W2 → membershipRepo vrátí null pro W2
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.updateSettings(
          'w2',
          'jan',
          { color: '#000' },
          mkUser(UserRole.PJ, 'pj-w1'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('vyhodí NotFoundException pro neexistující svět (anti-leak)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(
        service.updateSettings(
          'fake',
          'jan',
          { color: '#000' },
          mkUser(UserRole.PJ),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('merguje displaySettings — nepřepisuje celý objekt', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockCharsService.findBySlugRaw.mockResolvedValue(
        mockChar('char1', 'jan', 'Jan Novák'),
      );
      mockSubdocs.getCalendar.mockResolvedValue({
        ...mockCalendar('char1'),
        displaySettings: { defaultView: 'month', isHiddenInAggregate: false },
      });
      mockSubdocs.updateCalendar.mockResolvedValue(mockCalendar('char1'));

      await service.updateSettings(
        'w1',
        'jan',
        { displaySettings: { isHiddenInAggregate: true } },
        mkUser(UserRole.PJ, 'pj1'),
      );

      expect(mockSubdocs.updateCalendar).toHaveBeenCalledWith('char1', {
        displaySettings: { defaultView: 'month', isHiddenInAggregate: true },
      });
    });
  });
});
