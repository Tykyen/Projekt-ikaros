import { foldSortKey } from './name-sort';

describe('foldSortKey', () => {
  it('reportovaná chyba: „Čáp" už neřadí za „Zebra"', () => {
    expect(foldSortKey('Čáp') < foldSortKey('Zebra')).toBe(true);
    expect(foldSortKey('Čáp')).toBe('cap');
  });

  it('strip celé české diakritiky', () => {
    expect(foldSortKey('áčďéěíňóřšťúůýž')).toBe('acdeeinorstuuyz');
    expect(foldSortKey('ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ')).toBe('acdeeinorstuuyz');
  });

  it('lowercase', () => {
    expect(foldSortKey('DRAK')).toBe('drak');
  });

  it('sjednotí whitespace a ořízne okraje', () => {
    expect(foldSortKey('  Zlatý   drak  ')).toBe('zlaty drak');
  });

  it('ne-string → prázdný klíč', () => {
    expect(foldSortKey(undefined)).toBe('');
    expect(foldSortKey(null)).toBe('');
    expect(foldSortKey(42)).toBe('');
  });

  it('prázdný string', () => {
    expect(foldSortKey('')).toBe('');
  });

  it('reálné řazení katalogu je česky přívětivé', () => {
    const names = ['Zebra', 'Čáp', 'Ábel', 'drak', 'Šíp', 'Řež'];
    // Mirror Mongo `.sort({nameSort:1})` = binární pořadí nad ASCII klíčem.
    const sorted = [...names].sort((a, b) => {
      const ka = foldSortKey(a);
      const kb = foldSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    // fold odstraní diakritiku → řadí dle základního písmene, ne za ASCII konec.
    expect(sorted).toEqual(['Ábel', 'Čáp', 'drak', 'Řež', 'Šíp', 'Zebra']);
  });
});
