import { normalizeRoutePath, compareEndpoints } from './comparator';

describe('normalizeRoutePath', () => {
  it('normalizuje C# parametry {id}', () => {
    expect(normalizeRoutePath('/api/worlds/{id}')).toBe('/api/worlds/{param}');
  });

  it('normalizuje NestJS parametry :id', () => {
    expect(normalizeRoutePath('/api/worlds/:id')).toBe('/api/worlds/{param}');
  });

  it('normalizuje NestJS parametry :worldId', () => {
    expect(normalizeRoutePath('/api/worlds/:worldId/pages/:slug')).toBe(
      '/api/worlds/{param}/pages/{param}',
    );
  });

  it('odstraní trailing slash', () => {
    expect(normalizeRoutePath('/api/worlds/')).toBe('/api/worlds');
  });

  it('převede na lowercase', () => {
    expect(normalizeRoutePath('/api/Worlds')).toBe('/api/worlds');
  });

  it('sloučí vícenásobné lomítka', () => {
    expect(normalizeRoutePath('/api//worlds//pages')).toBe('/api/worlds/pages');
  });
});

describe('compareEndpoints', () => {
  it('najde přesnou shodu', () => {
    const result = compareEndpoints(
      [{ verb: 'GET', path: '/api/worlds' }],
      [{ verb: 'GET', path: '/api/worlds' }],
    );
    expect(result.covered).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
  });

  it('označí chybějící endpoint', () => {
    const result = compareEndpoints([{ verb: 'GET', path: '/api/worlds' }], []);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].old).toBe('GET /api/worlds');
  });

  it('označí přejmenovaný parametr jako renamed', () => {
    // {id} i :worldId se normalizují na {param} → stejná statická struktura, různé originály → renamed
    const result = compareEndpoints(
      [{ verb: 'GET', path: '/api/worlds/{id}' }],
      [{ verb: 'GET', path: '/api/worlds/:worldId' }],
    );
    expect(result.renamed).toHaveLength(1);
    expect(result.covered).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it('označí endpoint jen v novém jako extra', () => {
    const result = compareEndpoints(
      [],
      [{ verb: 'GET', path: '/api/admin/users' }],
    );
    expect(result.extra).toHaveLength(1);
  });
});
