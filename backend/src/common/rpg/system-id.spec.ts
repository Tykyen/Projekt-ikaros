import { resolveSystemId, SYSTEM_ALIASES } from './system-id';

describe('resolveSystemId (DUN-1 — alias → canonical engine id)', () => {
  it('mapuje alias formy z world.system na canonical', () => {
    expect(resolveSystemId('drd-plus')).toBe('drdplus');
    expect(resolveSystemId('call-of-cthulhu')).toBe('coc');
    expect(resolveSystemId('draci-hlidka')).toBe('drdh');
    expect(resolveSystemId('dnd')).toBe('dnd5e');
    expect(resolveSystemId('pribehy_imperia')).toBe('pi');
    expect(resolveSystemId('vlastni')).toBe('generic');
  });

  it('canonical id nechá beze změny', () => {
    for (const canonical of ['drdplus', 'coc', 'drdh', 'dnd5e', 'matrix']) {
      expect(resolveSystemId(canonical)).toBe(canonical);
    }
  });

  it('normalizuje case (world.system může přijít různě)', () => {
    expect(resolveSystemId('DRD-Plus')).toBe('drdplus');
    expect(resolveSystemId('MATRIX')).toBe('matrix');
  });

  it('prázdné / null / undefined → ""', () => {
    expect(resolveSystemId('')).toBe('');
    expect(resolveSystemId(null)).toBe('');
    expect(resolveSystemId(undefined)).toBe('');
  });

  it('neznámé id se vrací lowercased (volající rozhodne)', () => {
    expect(resolveSystemId('Novy-System')).toBe('novy-system');
  });

  it('každá alias hodnota je sama canonical (žádný řetěz alias→alias)', () => {
    // Ochrana proti tomu, aby cíl aliasu byl zase alias (jinak by jeden průchod
    // nestačil). Cíle musí být fixed pointy.
    for (const target of Object.values(SYSTEM_ALIASES)) {
      expect(resolveSystemId(target)).toBe(target);
    }
  });
});
