import {
  absoluteDay,
  calculateCelestialStates,
  totalDaysPerYear,
} from './world-calendar-config.utils';
import type { WorldCalendarConfig } from './interfaces/world-calendar-config.interface';

const base: WorldCalendarConfig = {
  id: '1',
  worldId: 'w1',
  hoursPerDay: 24,
  daysOfWeek: [],
  months: [
    { name: 'Leden', daysCount: 30 },
    { name: 'Únor', daysCount: 30 },
    { name: 'Březen', daysCount: 30 },
  ],
  celestialBodies: [],
  referenceDate: { year: 0, month: 1, day: 1, hour: 0 },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('totalDaysPerYear', () => {
  it('vrátí součet dní všech měsíců', () => {
    expect(totalDaysPerYear(base)).toBe(90);
  });
});

describe('absoluteDay', () => {
  it('rok 0, měsíc 1, den 1 = 1', () => {
    expect(absoluteDay(0, 1, 1, base)).toBe(1);
  });
  it('rok 0, měsíc 2, den 1 = 31', () => {
    expect(absoluteDay(0, 2, 1, base)).toBe(31);
  });
  it('rok 1, měsíc 1, den 1 = 91', () => {
    expect(absoluteDay(1, 1, 1, base)).toBe(91);
  });
});

describe('calculateCelestialStates', () => {
  it('vrátí [] když chybí referenceDate', () => {
    const cfg = { ...base, referenceDate: null };
    expect(calculateCelestialStates(1, 1, 1, cfg, [])).toEqual([]);
  });

  it('vrátí [] když nejsou žádná tělesa', () => {
    expect(calculateCelestialStates(1, 1, 1, base, [])).toEqual([]);
  });

  it('moon: stejné datum jako reference vrátí referenceState fázi', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 'm1',
          name: 'Měsíc',
          type: 'moon',
          config: {
            cycleLength: 28,
            phases: ['nový', 'dorůstající', 'úplněk', 'couvající'],
          },
          referenceState: 'nový',
        },
      ],
    };
    const result = calculateCelestialStates(0, 1, 1, cfg, []);
    expect(result[0].state).toBe('nový');
    expect(result[0].isManualOverride).toBe(false);
  });

  it('moon: 7 dní po novém = dorůstající (¼ cyklu 28 dní)', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 'm1',
          name: 'Měsíc',
          type: 'moon',
          config: {
            cycleLength: 28,
            phases: ['nový', 'dorůstající', 'úplněk', 'couvající'],
          },
          referenceState: 'nový',
        },
      ],
    };
    // den 8 = delta 7
    const result = calculateCelestialStates(0, 1, 8, cfg, []);
    expect(result[0].state).toBe('dorůstající');
  });

  it('záporné delta: 14 dní PŘED referencí s nový → úplněk', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      referenceDate: { year: 0, month: 1, day: 15, hour: 0 },
      celestialBodies: [
        {
          id: 'm1',
          name: 'Měsíc',
          type: 'moon',
          config: {
            cycleLength: 28,
            phases: ['nový', 'dorůstající', 'úplněk', 'couvající'],
          },
          referenceState: 'nový',
        },
      ],
    };
    // den 1 = delta -14 od reference (den 15)
    const result = calculateCelestialStates(0, 1, 1, cfg, []);
    expect(result[0].state).toBe('úplněk');
  });

  it('manuální override přebíjí výpočet', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 'm1',
          name: 'Měsíc',
          type: 'moon',
          config: {
            cycleLength: 28,
            phases: ['nový', 'dorůstající', 'úplněk', 'couvající'],
          },
          referenceState: 'nový',
        },
      ],
    };
    const result = calculateCelestialStates(0, 1, 1, cfg, [
      { bodyId: 'm1', value: 'úplněk' },
    ]);
    expect(result[0].state).toBe('úplněk');
    expect(result[0].isManualOverride).toBe(true);
  });

  it('sun: vrátí hodiny východu/západu pro daný měsíc', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 's1',
          name: 'Slunce',
          type: 'sun',
          config: { riseHour: [6, 5, 6], setHour: [18, 19, 18] },
          referenceState: '',
        },
      ],
    };
    const result = calculateCelestialStates(0, 2, 1, cfg, []);
    expect(result[0].state).toBe('vychod: 5:00, zapad: 19:00');
  });

  it('comet: viditelná v průletovém okně', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 'c1',
          name: 'Kometa',
          type: 'comet',
          config: { periodYears: 10, apparitionDurationYears: 1 },
          referenceState: 'viditelná',
        },
      ],
    };
    // 45 dní po referenci (apparition = 1 rok = 90 dní)
    const result = calculateCelestialStates(0, 1, 46, cfg, []);
    expect(result[0].state).toBe('viditelná');
  });

  it('comet: neviditelná po skončení průletu', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 'c1',
          name: 'Kometa',
          type: 'comet',
          config: { periodYears: 10, apparitionDurationYears: 1 },
          referenceState: 'viditelná',
        },
      ],
    };
    // 95 dní po referenci (apparition = 90 dní) — rok 1, měsíc 1, den 6 → absoluteDay=96, delta=95
    const result = calculateCelestialStates(1, 1, 6, cfg, []);
    expect(result[0].state).toBe('neviditelná');
  });

  it('planet: stejné datum jako reference vrátí konstelaci ze stavu', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 'p1',
          name: 'Mars',
          type: 'planet',
          config: {
            orbitalPeriod: 360,
            constellations: ['Beran', 'Býk', 'Blíženci', 'Rak'],
          },
          referenceState: 'Beran',
        },
      ],
    };
    const result = calculateCelestialStates(0, 1, 1, cfg, []);
    expect(result[0].state).toBe('Beran');
  });

  it('planet: po čtvrtině orbital period postoupí o jednu konstelaci', () => {
    // orbitalPeriod=360 dní, 4 konstelace → každá 90 dní → po 90 dnech od Berana postoupí na Býka
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 'p1',
          name: 'Mars',
          type: 'planet',
          config: {
            orbitalPeriod: 360,
            constellations: ['Beran', 'Býk', 'Blíženci', 'Rak'],
          },
          referenceState: 'Beran',
        },
      ],
    };
    // delta = 90 dní → posun přesně o 1/4 cyklu = 90° = další konstelace (Býk)
    // referenceDate je rok 0 měsíc 1 den 1 (absoluteDay 1); rok 1 měsíc 1 den 1 = absoluteDay 91 → delta 90
    const result = calculateCelestialStates(1, 1, 1, cfg, []);
    expect(result[0].state).toBe('Býk');
  });

  it('planet: záporné delta vrací konstelaci z opačného směru', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      referenceDate: { year: 1, month: 1, day: 1, hour: 0 },
      celestialBodies: [
        {
          id: 'p1',
          name: 'Mars',
          type: 'planet',
          config: {
            orbitalPeriod: 360,
            constellations: ['Beran', 'Býk', 'Blíženci', 'Rak'],
          },
          referenceState: 'Beran',
        },
      ],
    };
    // delta = -90 (rok 0 měsíc 1 den 1 = absoluteDay 1; reference rok 1 = absoluteDay 91)
    // -90 mod 360 = 270 (po normalizaci) = poslední konstelace (Rak)
    const result = calculateCelestialStates(0, 1, 1, cfg, []);
    expect(result[0].state).toBe('Rak');
  });

  it('other: 14 dní po výchozím stavu s 28-denním cyklem 4 stavů → druhý stav', () => {
    const cfg: WorldCalendarConfig = {
      ...base,
      celestialBodies: [
        {
          id: 'o1',
          name: 'Magická vlna',
          type: 'other',
          config: {
            cycleLength: 28,
            states: ['nízká', 'rostoucí', 'vysoká', 'klesající'],
          },
          referenceState: 'nízká',
        },
      ],
    };
    // den 8 = delta 7 = ¼ cyklu → 'rostoucí'
    const result = calculateCelestialStates(0, 1, 8, cfg, []);
    expect(result[0].state).toBe('rostoucí');
  });
});
