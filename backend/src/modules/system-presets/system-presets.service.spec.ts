import { Test } from '@nestjs/testing';
import { SystemPresetsService } from './system-presets.service';

describe('SystemPresetsService', () => {
  let service: SystemPresetsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SystemPresetsService],
    }).compile();
    service = module.get(SystemPresetsService);
  });

  describe('findAll', () => {
    it('vrátí 16 systémů', () => {
      expect(service.findAll()).toHaveLength(16);
    });

    it('položky obsahují system + displayName, ne schema (úspora bandwidth)', () => {
      const result = service.findAll();
      for (const item of result) {
        expect(typeof item.system).toBe('string');
        expect(typeof item.displayName).toBe('string');
        expect(item).not.toHaveProperty('schema');
      }
    });

    it('všechny system identifikátory jsou unikátní', () => {
      const systems = service.findAll().map((p) => p.system);
      expect(new Set(systems).size).toBe(systems.length);
    });
  });

  describe('findOne', () => {
    it('vrátí dnd5e s plným schématem', () => {
      const result = service.findOne('dnd5e');
      expect(result).not.toBeNull();
      expect(result!.system).toBe('dnd5e');
      expect(result!.displayName).toBe('D&D 5e');
      expect(result!.schema.length).toBeGreaterThan(0);
    });

    it('každý SchemaBlock má povinné fieldy', () => {
      const result = service.findOne('dnd5e');
      for (const block of result!.schema) {
        expect(typeof block.key).toBe('string');
        expect(typeof block.label).toBe('string');
        expect(typeof block.type).toBe('string');
        expect(typeof block.order).toBe('number');
      }
    });

    it('orders jsou unique a vzestupné v dnd5e', () => {
      const orders = service.findOne('dnd5e')!.schema.map((b) => b.order);
      expect(new Set(orders).size).toBe(orders.length);
    });

    it('vrátí null pro neexistující systém', () => {
      expect(service.findOne('neexistujici')).toBeNull();
    });

    it('všech 16 systémů je dohledatelných', () => {
      const expected = [
        'dnd5e',
        'dnd2e',
        'dnd3plus',
        'drd-hero',
        'drd16-warrior',
        'drd16-wizard',
        'drd16-thief',
        'drd16-ranger',
        'drd16-alchemy',
        'gurps',
        'call-of-cthulhu',
        'fate',
        'shadowrun',
        'jad',
        'pi',
        'matrix-custom',
      ];
      for (const sys of expected) {
        expect(service.findOne(sys)).not.toBeNull();
      }
    });
  });

  // D-NEW-SYS-PRESET-SEED-DRIFT — `world.system` (FE canonical) → BE preset id.
  describe('findOne — alias normalizace world.system → preset', () => {
    it('mapuje canonical id na BE preset id', () => {
      expect(service.findOne('matrix')?.system).toBe('matrix-custom');
      expect(service.findOne('coc')?.system).toBe('call-of-cthulhu');
      expect(service.findOne('drdh')?.system).toBe('drd-hero');
      expect(service.findOne('draci-hlidka')?.system).toBe('drd-hero');
    });

    it('je case-insensitive', () => {
      expect(service.findOne('Matrix')?.system).toBe('matrix-custom');
      expect(service.findOne('COC')?.system).toBe('call-of-cthulhu');
    });

    it('systémy bez BE presetu vracejí null (FE-canonical, soft-mode)', () => {
      for (const sys of ['drd16', 'drd2', 'drdplus']) {
        expect(service.findOne(sys)).toBeNull();
      }
    });
  });
});
