import { describe, expect, it } from '@jest/globals';
import {
  CLIMATE_EPOCHS,
  getClimateEpochForYear,
  getClimateEpochOffset,
} from '../climateEpochs';

describe('CLIMATE_EPOCHS — data integrity', () => {
  it('má více než 10 epoch', () => {
    expect(CLIMATE_EPOCHS.length).toBeGreaterThanOrEqual(10);
  });

  it('všechny IDs jsou unikátní', () => {
    const ids = CLIMATE_EPOCHS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('epoch ranges jsou contiguous — žádné gaps mezi epochs', () => {
    for (let i = 0; i < CLIMATE_EPOCHS.length - 1; i++) {
      expect(CLIMATE_EPOCHS[i].yearTo).toBe(CLIMATE_EPOCHS[i + 1].yearFrom);
    }
  });

  it('yearFrom < yearTo v každé epoch', () => {
    for (const e of CLIMATE_EPOCHS) {
      expect(e.yearFrom).toBeLessThan(e.yearTo);
    }
  });

  it('offsets v reasonable range (-10..+10 °C)', () => {
    for (const e of CLIMATE_EPOCHS) {
      expect(e.tempOffsetCelsius).toBeGreaterThanOrEqual(-10);
      expect(e.tempOffsetCelsius).toBeLessThanOrEqual(10);
    }
  });

  it('„modern" epoch má offset = 0 (baseline)', () => {
    const modern = CLIMATE_EPOCHS.find((e) => e.id === 'modern');
    expect(modern).toBeDefined();
    expect(modern!.tempOffsetCelsius).toBe(0);
  });
});

describe('getClimateEpochForYear', () => {
  it('rok 1180 → Středověké klimatické optimum', () => {
    const e = getClimateEpochForYear(1180);
    expect(e.id).toBe('medieval-warm');
    expect(e.tempOffsetCelsius).toBe(0.7);
  });

  it('rok 2039 → Blízká budoucnost (IPCC SSP2-4.5)', () => {
    const e = getClimateEpochForYear(2039);
    expect(e.id).toBe('near-future');
    expect(e.tempOffsetCelsius).toBe(1.2);
  });

  it('rok 1500 → Malá doba ledová', () => {
    const e = getClimateEpochForYear(1500);
    expect(e.id).toBe('little-ice-age');
    expect(e.tempOffsetCelsius).toBe(-0.7);
  });

  it('rok 0 → Římské klimatické optimum (year 0 = 1 BCE astronomical)', () => {
    const e = getClimateEpochForYear(0);
    expect(e.id).toBe('roman-warm');
  });

  it('rok -25000 → Doba ledová (LGM)', () => {
    const e = getClimateEpochForYear(-25000);
    expect(e.id).toBe('last-glacial-maximum');
    expect(e.tempOffsetCelsius).toBe(-5);
  });

  it('rok -50000 (pre-LGM) → fallback na LGM', () => {
    const e = getClimateEpochForYear(-50000);
    expect(e.id).toBe('last-glacial-maximum');
  });

  it('rok 5000 (post-3000) → fallback na far-future', () => {
    const e = getClimateEpochForYear(5000);
    expect(e.id).toBe('far-future');
    expect(e.tempOffsetCelsius).toBe(4.5);
  });

  it('rok 1950 → modern', () => {
    const e = getClimateEpochForYear(1950);
    expect(e.id).toBe('modern');
    expect(e.tempOffsetCelsius).toBe(0);
  });

  it('boundary rok 800 → medieval-warm (inclusive start)', () => {
    const e = getClimateEpochForYear(800);
    expect(e.id).toBe('medieval-warm');
  });

  it('boundary rok 1300 → little-ice-age (exclusive end of medieval)', () => {
    const e = getClimateEpochForYear(1300);
    expect(e.id).toBe('little-ice-age');
  });
});

describe('getClimateEpochOffset', () => {
  it('rok 1180 → +0.7', () => {
    expect(getClimateEpochOffset(1180)).toBe(0.7);
  });

  it('rok 2039 → +1.2', () => {
    expect(getClimateEpochOffset(2039)).toBe(1.2);
  });

  it('rok 1700 → -0.7 (LIA)', () => {
    expect(getClimateEpochOffset(1700)).toBe(-0.7);
  });

  it('rok 2000 → 0 (modern baseline)', () => {
    expect(getClimateEpochOffset(2000)).toBe(0);
  });
});
