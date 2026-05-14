import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorldCalendarConfigService } from './world-calendar-config.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

describe('WorldCalendarConfigService', () => {
  let service: WorldCalendarConfigService;

  const mockRepo = { findByWorldId: jest.fn(), upsert: jest.fn() };
  const mockMembership = { findByUserAndWorld: jest.fn() };
  const mockWorlds = { findById: jest.fn() };

  const Admin = { id: 'a', role: 2, username: 'a' } as const;
  const Hrac = { id: 'h', role: 5, username: 'h' } as const;
  const PJ = { id: 'pj', role: 3, username: 'pj' } as const;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorldCalendarConfigService,
        { provide: 'IWorldCalendarConfigRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
      ],
    }).compile();
    service = module.get(WorldCalendarConfigService);
  });

  describe('getConfig', () => {
    it('vrátí config pokud existuje (Admin)', async () => {
      const cfg = { id: '1', worldId: 'W1' };
      mockRepo.findByWorldId.mockResolvedValue(cfg);
      expect(await service.getConfig('W1', Admin)).toBe(cfg);
    });

    it('null pro nenastavený svět', async () => {
      mockRepo.findByWorldId.mockResolvedValue(null);
      expect(await service.getConfig('W1', Admin)).toBeNull();
    });

    it('member smí GET', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 0 });
      mockRepo.findByWorldId.mockResolvedValue({ id: '1' });
      await service.getConfig('W1', Hrac);
      expect(mockRepo.findByWorldId).toHaveBeenCalled();
    });

    it('non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.getConfig('W1', Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe('upsertConfig — autorizace', () => {
    const baseDto = {
      months: [{ name: 'Leden', daysCount: 30 }],
      celestialBodies: [],
    };

    it('Admin smí', async () => {
      mockRepo.upsert.mockResolvedValue({ id: '1' });
      await service.upsertConfig('W1', baseDto, Admin);
      expect(mockRepo.upsert).toHaveBeenCalled();
    });

    it('PJ smí', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.upsert.mockResolvedValue({ id: '1' });
      await service.upsertConfig('W1', baseDto, PJ);
      expect(mockRepo.upsert).toHaveBeenCalled();
    });

    it('PomocnyPJ smí (konzistence s WorldNews/Timeline)', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.upsert.mockResolvedValue({ id: '1' });
      await service.upsertConfig('W1', baseDto, Hrac);
      expect(mockRepo.upsert).toHaveBeenCalled();
    });

    it('Hrac NESMÍ → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(service.upsertConfig('W1', baseDto, Hrac)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('neexistující svět → 404 (per auth-leak-policy: auth-required)', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.upsertConfig('fake', baseDto, PJ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('upsertConfig — validace', () => {
    beforeEach(() => {
      mockRepo.upsert.mockResolvedValue({ id: '1' });
    });

    it('Sluneční těleso bez měsíců → 400 (sanity check)', async () => {
      const badDto = {
        months: [],
        celestialBodies: [
          {
            name: 'Slunce',
            type: 'sun' as const,
            config: { riseHour: [], setHour: [] },
            referenceState: '',
          },
        ],
      };
      await expect(service.upsertConfig('W1', badDto, Admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('SunConfig riseHour neodpovídá months.length → 400', async () => {
      const badDto = {
        months: [{ name: 'Leden', daysCount: 30 }],
        celestialBodies: [
          {
            name: 'Slunce',
            type: 'sun' as const,
            config: { riseHour: [6, 7], setHour: [18] },
            referenceState: '',
          },
        ],
      };
      await expect(service.upsertConfig('W1', badDto, Admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('referenceDate.month mimo months.length → 400', async () => {
      const badDto = {
        months: [{ name: 'Leden', daysCount: 30 }],
        referenceDate: { year: 0, month: 5, day: 1, hour: 0 },
      };
      await expect(service.upsertConfig('W1', badDto, Admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('referenceDate.day mimo daysCount měsíce → 400', async () => {
      const badDto = {
        months: [{ name: 'Leden', daysCount: 30 }],
        referenceDate: { year: 0, month: 1, day: 31, hour: 0 },
      };
      await expect(service.upsertConfig('W1', badDto, Admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('referenceDate.hour mimo hoursPerDay → 400', async () => {
      const badDto = {
        hoursPerDay: 24,
        months: [{ name: 'Leden', daysCount: 30 }],
        referenceDate: { year: 0, month: 1, day: 1, hour: 25 },
      };
      await expect(service.upsertConfig('W1', badDto, Admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('celestialBodies bez id → server přiřadí UUID', async () => {
      const dto = {
        months: [{ name: 'Leden', daysCount: 30 }],
        celestialBodies: [
          {
            name: 'Měsíc',
            type: 'moon' as const,
            config: { cycleLength: 28, phases: ['nový'] },
            referenceState: 'nový',
          },
        ],
      };
      await service.upsertConfig('W1', dto, Admin);
      const saved = mockRepo.upsert.mock.calls[0][1];
      expect(typeof saved.celestialBodies[0].id).toBe('string');
      expect(saved.celestialBodies[0].id.length).toBeGreaterThan(0);
    });
  });
});
