/**
 * 9.2b — testy pro refactor utils na nový shape (8-fázový lunar, FE engine parita).
 *
 * Mirror FE `src/shared/lib/calendarEngine/__tests__/` (9.2a).
 */
import {
  calculateCelestialStates,
  daysInMonth,
  getLunarPhase,
  isGregorianLike,
  toAbsDay,
} from './world-calendar-config.utils';
import {
  GREGORIAN_DEFAULT_TEMPLATE,
  MOON_EPOCH_REFERENCE_ABSDAY,
} from './gregorian-default';
import type {
  CelestialBody,
  WorldCalendarConfig,
} from './interfaces/world-calendar-config.interface';

const gregorian: WorldCalendarConfig = {
  id: '',
  worldId: 'w1',
  ...GREGORIAN_DEFAULT_TEMPLATE,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fantasy: WorldCalendarConfig = {
  id: '',
  worldId: 'w1',
  slug: 'f1',
  name: 'Fantasy',
  hoursPerDay: 26,
  daysOfWeek: ['A', 'B', 'C', 'D', 'E'],
  months: Array.from({ length: 10 }, (_, i) => ({
    name: `M${i + 1}`,
    daysCount: 30,
  })),
  celestialBodies: [],
  seasons: [],
  epochOffset: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('isGregorianLike', () => {
  it('default Gregorian = true', () => {
    expect(isGregorianLike(gregorian)).toBe(true);
  });
  it('fantasy = false', () => {
    expect(isGregorianLike(fantasy)).toBe(false);
  });
});

describe('daysInMonth', () => {
  it('Únor 28 pro non-leap', () => {
    expect(daysInMonth(1, 2023, gregorian)).toBe(28);
  });
  it('Únor 29 pro leap 2000', () => {
    expect(daysInMonth(1, 2000, gregorian)).toBe(29);
  });
  it('Únor 28 pro 1900', () => {
    expect(daysInMonth(1, 1900, gregorian)).toBe(28);
  });
  it('Fantasy měsíc 30 dnů', () => {
    expect(daysInMonth(3, 100, fantasy)).toBe(30);
  });
});

describe('toAbsDay', () => {
  it('Gregorian (0, 0, 1) = 0', () => {
    expect(toAbsDay(0, 0, 1, gregorian)).toBe(0);
  });
  it('6. 1. 2000 = MOON_EPOCH_REFERENCE_ABSDAY', () => {
    expect(toAbsDay(2000, 0, 6, gregorian)).toBe(MOON_EPOCH_REFERENCE_ABSDAY);
  });
  it('Záporný rok deterministicky vrací hodnotu (kontrola monotónnosti)', () => {
    // (rok -1, prosinec) < (rok 0, leden) — chronologie respektována.
    const negYearLast = toAbsDay(-1, 11, 31, gregorian);
    const yearZeroFirst = toAbsDay(0, 0, 1, gregorian);
    expect(negYearLast).toBeLessThan(yearZeroFirst);
  });
});

describe('getLunarPhase — Gregorian Měsíc', () => {
  const moon = gregorian.celestialBodies[0];

  it('Epoch = new', () => {
    expect(getLunarPhase(MOON_EPOCH_REFERENCE_ABSDAY, moon)).toBe('new');
  });
  it('Day +9 = first-quarter', () => {
    expect(getLunarPhase(MOON_EPOCH_REFERENCE_ABSDAY + 9, moon)).toBe(
      'first-quarter',
    );
  });
  it('Day +17 = full', () => {
    expect(getLunarPhase(MOON_EPOCH_REFERENCE_ABSDAY + 17, moon)).toBe('full');
  });
  it('Day +24 = last-quarter', () => {
    expect(getLunarPhase(MOON_EPOCH_REFERENCE_ABSDAY + 24, moon)).toBe(
      'last-quarter',
    );
  });
});

describe('getLunarPhase — fantasy 16d cyklus', () => {
  const body: CelestialBody = {
    id: 'b',
    name: 'Modrý měsíc',
    orbitalPeriodDays: 16,
    color: '#0033ff',
    epochOffset: 0,
  };

  it('Pokrývá všech 8 fází', () => {
    const phases = new Set<string>();
    for (let d = 0; d < 16; d++) phases.add(getLunarPhase(d, body));
    expect(phases.size).toBe(8);
  });
  it('Day 0 = new, day 8 = full', () => {
    expect(getLunarPhase(0, body)).toBe('new');
    expect(getLunarPhase(8, body)).toBe('full');
  });
});

describe('calculateCelestialStates', () => {
  it('Prázdné celestialBodies → []', () => {
    expect(calculateCelestialStates(2025, 0, 1, fantasy, [])).toEqual([]);
  });

  it('Gregorian Měsíc 6. 1. 2000 = new + isManualOverride false', () => {
    const result = calculateCelestialStates(2000, 0, 6, gregorian, []);
    expect(result).toHaveLength(1);
    expect(result[0].bodyId).toBe('moon');
    expect(result[0].phase).toBe('new');
    expect(result[0].isManualOverride).toBe(false);
    expect(result[0].color).toBe('#c0c8d0');
  });

  it('Manual override přebíjí výpočet', () => {
    const result = calculateCelestialStates(2000, 0, 6, gregorian, [
      { bodyId: 'moon', phase: 'full' },
    ]);
    expect(result[0].phase).toBe('full');
    expect(result[0].isManualOverride).toBe(true);
  });
});
