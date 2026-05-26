import { describe, expect, it } from '@jest/globals';
import { MARKOV_MATRICES, validateMatrix } from '../markovMatrices';
import type { KoppenZone } from '../types';

describe('MARKOV_MATRICES — všechny řádky sčítají na 1.0', () => {
  const zones = Object.keys(MARKOV_MATRICES) as KoppenZone[];
  it.each(zones)('zóna %s má všechny řádky validní', (zone) => {
    const result = validateMatrix(MARKOV_MATRICES[zone]);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('MARKOV_MATRICES — sémantická správnost', () => {
  it('CONTROLLED má pravděpodobnost clear=1.0 (totální stabilita)', () => {
    expect(MARKOV_MATRICES.CONTROLLED.clear.clear).toBe(1.0);
  });

  it('Polární (EF) má vysokou persistenci sněhu', () => {
    expect(MARKOV_MATRICES.EF.snow.snow).toBeGreaterThanOrEqual(0.4);
  });

  it('Pouštní (BWh) má dominanci clear', () => {
    expect(MARKOV_MATRICES.BWh.clear.clear).toBeGreaterThanOrEqual(0.8);
  });

  it('Tropické (Af) má vyšší rain persistence', () => {
    expect(MARKOV_MATRICES.Af.rain.rain).toBeGreaterThanOrEqual(0.35);
  });

  it('Mars (EXTRATERRESTRIAL) nemá rain (storm.rain = 0)', () => {
    expect(MARKOV_MATRICES.EXTRATERRESTRIAL.storm.rain).toBe(0);
    expect(MARKOV_MATRICES.EXTRATERRESTRIAL.clear.rain).toBe(0);
  });
});
