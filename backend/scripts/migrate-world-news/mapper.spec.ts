import { mapLegacyItem, normalizeWorldId, MapResult } from './mapper';

describe('mapLegacyItem', () => {
  const valid = {
    _id: { $oid: '65a1b2c3d4e5f60123456789' },
    WorldId: 'world1',
    Title: 'Titulek',
    Content: 'Obsah',
    Date: '2025-01-15T10:00:00.000Z',
    Type: 'info',
    Link: 'https://example.com',
  };

  it('mapuje PascalCase → camelCase', () => {
    const result = mapLegacyItem(valid) as MapResult & { ok: true };
    expect(result.ok).toBe(true);
    expect(result.data.title).toBe('Titulek');
    expect(result.data.content).toBe('Obsah');
    expect(result.data.date).toBe('2025-01-15T10:00:00.000Z');
    expect(result.data.type).toBe('info');
    expect(result.data.link).toBe('https://example.com');
    expect(result.data.worldId).toBe('world1');
  });

  it('zachová _id', () => {
    const result = mapLegacyItem(valid) as MapResult & { ok: true };
    expect(result.data._id).toBe('65a1b2c3d4e5f60123456789');
  });

  it('chybějící Title → ok=false s důvodem', () => {
    const result = mapLegacyItem({ ...valid, Title: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/title/i);
  });

  it('chybějící Content → ok=false', () => {
    const result = mapLegacyItem({ ...valid, Content: '' });
    expect(result.ok).toBe(false);
  });

  it('neplatný Type → ok=false', () => {
    const result = mapLegacyItem({ ...valid, Type: 'xxx' });
    expect(result.ok).toBe(false);
  });

  it('Type undefined → default info', () => {
    const result = mapLegacyItem({ ...valid, Type: undefined }) as MapResult & {
      ok: true;
    };
    expect(result.data.type).toBe('info');
  });

  it('Link undefined → vynechané v output', () => {
    const result = mapLegacyItem({ ...valid, Link: undefined }) as MapResult & {
      ok: true;
    };
    expect(result.data.link).toBeUndefined();
  });
});

describe('normalizeWorldId', () => {
  it('"MatrixWorldId" → null', () => {
    expect(normalizeWorldId('MatrixWorldId')).toBeNull();
  });
  it('null → null', () => {
    expect(normalizeWorldId(null)).toBeNull();
  });
  it('undefined → null', () => {
    expect(normalizeWorldId(undefined)).toBeNull();
  });
  it('prázdný string → null', () => {
    expect(normalizeWorldId('')).toBeNull();
  });
  it('skutečné ID → ponechané', () => {
    expect(normalizeWorldId('abc123')).toBe('abc123');
  });
});
