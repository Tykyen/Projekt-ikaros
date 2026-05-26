import { describe, expect, it } from '@jest/globals';
import {
  gaussianFromUniform,
  hashSeed,
  mulberry32,
  seededGaussian,
} from '../gaussianRandom';

describe('mulberry32', () => {
  it('vrací deterministic outputs pro stejný seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it('vrací různé hodnoty pro různé seedy', () => {
    const a = mulberry32(42);
    const b = mulberry32(43);
    expect(a()).not.toBe(b());
  });

  it('všechny outputs v [0, 1)', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('gaussianFromUniform', () => {
  it('vrací deterministic output pro stejný (u1, u2)', () => {
    expect(gaussianFromUniform(0.5, 0.5)).toBe(gaussianFromUniform(0.5, 0.5));
  });

  it('průměr ~0 pro velký počet samples', () => {
    const rng = mulberry32(42);
    let sum = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      sum += gaussianFromUniform(rng(), rng());
    }
    const mean = sum / N;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  it('std dev ~1 pro velký počet samples', () => {
    const rng = mulberry32(42);
    const samples: number[] = [];
    const N = 10000;
    for (let i = 0; i < N; i++) {
      samples.push(gaussianFromUniform(rng(), rng()));
    }
    const mean = samples.reduce((s, v) => s + v, 0) / N;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeGreaterThan(0.95);
    expect(stdDev).toBeLessThan(1.05);
  });

  it('safe pro u1 = 0 (nepadá na -Infinity)', () => {
    const result = gaussianFromUniform(0, 0.5);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('seededGaussian', () => {
  it('deterministic pro stejný seed', () => {
    expect(seededGaussian(42)).toBe(seededGaussian(42));
  });
});

describe('hashSeed (FNV-1a)', () => {
  it('deterministic', () => {
    expect(hashSeed('praha')).toBe(hashSeed('praha'));
  });

  it('různé stringy → různé hashe', () => {
    expect(hashSeed('praha')).not.toBe(hashSeed('brno'));
  });

  it('vrací 32-bit unsigned int', () => {
    const h = hashSeed('test-string-12345');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
    expect(Number.isInteger(h)).toBe(true);
  });
});
