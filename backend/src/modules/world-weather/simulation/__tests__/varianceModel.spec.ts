import { describe, expect, it } from '@jest/globals';
import { generateTemperature, isAnomaly } from '../varianceModel';
import { transitionWeatherType } from '../markovTransition';
import { interpolateMonthly } from '../seasonalInterp';
import { mulberry32 } from '../gaussianRandom';

const PRAHA = {
  monthsTotal: 12,
  monthlyTemps: [-1, 0, 4, 9, 14, 17, 19, 19, 14, 9, 4, 0],
  monthlyStdDev: [5.5, 5.5, 5.0, 4.5, 4.0, 3.8, 3.5, 3.5, 4.0, 4.5, 5.0, 5.5],
};

describe('generateTemperature — deterministic', () => {
  it('stejný seed → identický output', () => {
    const a = generateTemperature({
      ...PRAHA,
      monthIndex: 6,
      day: 15,
      seed: 42,
    });
    const b = generateTemperature({
      ...PRAHA,
      monthIndex: 6,
      day: 15,
      seed: 42,
    });
    expect(a.temperature).toBe(b.temperature);
    expect(a.isAnomaly).toBe(b.isAnomaly);
  });

  it('různý seed → různé teploty', () => {
    const a = generateTemperature({
      ...PRAHA,
      monthIndex: 6,
      day: 15,
      seed: 42,
    });
    const b = generateTemperature({
      ...PRAHA,
      monthIndex: 6,
      day: 15,
      seed: 100,
    });
    expect(a.temperature).not.toBe(b.temperature);
  });

  it('expectedAvg ≈ monthlyTemps[monthIndex] uprostřed měsíce', () => {
    const result = generateTemperature({
      ...PRAHA,
      monthIndex: 6,
      day: 15,
      seed: 42,
    });
    expect(result.expectedAvg).toBeCloseTo(19, 0); // červenec = 19°C
  });

  it('vrátí stdDevUsed z monthlyStdDev', () => {
    const result = generateTemperature({
      ...PRAHA,
      monthIndex: 0,
      day: 15,
      seed: 42,
    });
    expect(result.stdDevUsed).toBe(5.5); // leden std dev
  });

  it('typické dny v rozsahu ±3 σ', () => {
    const samples: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const r = generateTemperature({ ...PRAHA, monthIndex: 6, day: 15, seed });
      samples.push(r.temperature);
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    // Expected avg 19°C, std 3.5 → 95% samples v [12, 26], extrémy do [8.5, 29.5]
    expect(max).toBeLessThan(35);
    expect(min).toBeGreaterThan(0);
  });

  it('throw když monthlyTemps.length !== monthsTotal', () => {
    expect(() =>
      generateTemperature({
        monthsTotal: 12,
        monthlyTemps: [0, 0, 0], // wrong length
        monthIndex: 0,
        day: 1,
        seed: 42,
      }),
    ).toThrow();
  });

  it('respektuje custom calendar (13 měsíců)', () => {
    const customConfig = {
      monthsTotal: 13,
      monthlyTemps: [-2, -1, 2, 6, 11, 15, 18, 19, 17, 12, 7, 2, -1],
      monthlyStdDev: [5, 5, 4.5, 4, 4, 3.8, 3.5, 3.5, 3.8, 4.2, 4.5, 4.8, 5],
    };
    const r = generateTemperature({
      ...customConfig,
      monthIndex: 5,
      day: 15,
      seed: 42,
    });
    expect(r.expectedAvg).toBeCloseTo(15, 0);
  });

  it('fallback defaultStdDev když monthlyStdDev chybí', () => {
    const r = generateTemperature({
      monthsTotal: 12,
      monthlyTemps: [-1, 0, 4, 9, 14, 17, 19, 19, 14, 9, 4, 0],
      monthIndex: 0,
      day: 15,
      seed: 42,
      defaultStdDev: 6,
    });
    expect(r.stdDevUsed).toBe(6);
  });
});

describe('isAnomaly', () => {
  it('false když odchylka ≤ 2 σ', () => {
    expect(isAnomaly(20, 19, 3.5)).toEqual({
      isAnomaly: false,
      anomalyType: null,
    });
  });

  it('true heat_wave když výrazně nad', () => {
    const r = isAnomaly(28, 19, 3.5);
    expect(r.isAnomaly).toBe(true);
    expect(r.anomalyType).toBe('heat_wave');
  });

  it('true cold_snap když výrazně pod', () => {
    const r = isAnomaly(10, 19, 3.5);
    expect(r.isAnomaly).toBe(true);
    expect(r.anomalyType).toBe('cold_snap');
  });
});

describe('interpolateMonthly', () => {
  it('vrátí měsíční průměr uprostřed měsíce', () => {
    expect(interpolateMonthly(PRAHA.monthlyTemps, 6, 15)).toBe(19);
  });

  it('day 1 lerpuje mezi prev a current', () => {
    // červenec: prev=červen(17), current=červenec(19), day 1 → ~50% mezi nimi
    const result = interpolateMonthly(PRAHA.monthlyTemps, 6, 1);
    expect(result).toBeGreaterThan(17);
    expect(result).toBeLessThan(19);
  });

  it('wrap-around: leden ↔ prosinec', () => {
    // leden day 1 — prev = prosinec (0), current = leden (-1)
    const result = interpolateMonthly(PRAHA.monthlyTemps, 0, 1);
    expect(result).toBeCloseTo(-0.5, 0); // hrubý mid mezi 0 a -1
  });
});

describe('transitionWeatherType', () => {
  it('deterministic pro stejný RNG seed', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    expect(transitionWeatherType('clear', 'Cfb', rng1)).toBe(
      transitionWeatherType('clear', 'Cfb', rng2),
    );
  });

  it('CONTROLLED zóna vždy vrací clear', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed);
      expect(transitionWeatherType('cloudy', 'CONTROLLED', rng)).toBe('clear');
    }
  });

  it('Mars nikdy nevrací rain', () => {
    const samples: string[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      samples.push(transitionWeatherType('storm', 'EXTRATERRESTRIAL', rng));
    }
    expect(samples).not.toContain('rain');
  });

  it('cold start (null current) vrací valid type', () => {
    const rng = mulberry32(42);
    const valid = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];
    expect(valid).toContain(transitionWeatherType(null, 'Cfb', rng));
  });
});
