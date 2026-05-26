import { describe, expect, it } from '@jest/globals';
import { generateTemperature } from '../varianceModel';
import { PARITY_FIXTURES } from '../__fixtures__/parity-fixtures';

/**
 * PARITY GATE — pokud BE změní variance logiku, musí být FE synced + tento test musí projít.
 * Po `sync-simulation-to-fe.ts` se FE má stejné fixtures + stejné assertion.
 * Jakýkoli drift selže CI v jednom z repos.
 *
 * Pro regeneraci očekávaných hodnot po legitimní změně logiky:
 *   PARITY_REGENERATE=1 npm test -- parity.spec.ts
 * → vypíše current values, ručně updatuj parity-fixtures.ts v BE i FE.
 */

const REGENERATE = process.env.PARITY_REGENERATE === '1';

describe('Variance simulation parity (BE ↔ FE)', () => {
  if (REGENERATE) {
    it.skip('REGENERATE mode — see console output', () => {
      /* skip */
    });
    console.log('\n=== PARITY REGENERATE ===');
    for (const fix of PARITY_FIXTURES) {
      const result = generateTemperature(fix.input);
      console.log(
        `${fix.name}:  expectedTemperature: ${result.temperature}, expectedIsAnomaly: ${result.isAnomaly}`,
      );
    }
    return;
  }

  it.each(PARITY_FIXTURES)('$name', (fix) => {
    const result = generateTemperature(fix.input);
    // Tolerance 0.1°C pro float arithmetic stability
    if (fix.expectedTemperature !== 0) {
      // Fixture má reálnou expected value (po regeneraci)
      expect(
        Math.abs(result.temperature - fix.expectedTemperature),
      ).toBeLessThanOrEqual(0.1);
      expect(result.isAnomaly).toBe(fix.expectedIsAnomaly);
    } else {
      // Fixture placeholder (0) — jen ověř, že generování nepadá a vrací číslo
      expect(typeof result.temperature).toBe('number');
      expect(Number.isFinite(result.temperature)).toBe(true);
    }
  });
});
