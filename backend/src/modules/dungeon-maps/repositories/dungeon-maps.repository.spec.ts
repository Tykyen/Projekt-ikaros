import { Types } from 'mongoose';
import { MongoDungeonMapsRepository } from './dungeon-maps.repository';
import { MAP_KINDS } from '../interfaces/dungeon-map.interface';

/**
 * D-077 — regrese: `mapKind: 'wilderness'` se při čtení kolabovalo na
 * `'dungeon'` (binární ternár v `toEntity`), a protože `replace()` jede
 * `overwrite` a service do něj vkládá `mapKind` z předchozího `findById`,
 * první uložení krajinu nevratně přepsalo na podzemí. Bez chybové hlášky.
 *
 * Testuje se ZÁMĚRNĚ přes repozitář, ne přes util: původní
 * `dungeon-walls.util.spec.ts` volá util přímo s ručně sestaveným objektem,
 * takže větev `wilderness` prošla zeleně, přestože ji reálná data nikdy
 * nedostala — mezi DB a util je právě to `toEntity`, kde se hodnota ztrácela.
 */
describe('MongoDungeonMapsRepository — toEntity (D-077)', () => {
  const id = new Types.ObjectId().toHexString();

  function makeRepo(doc: Record<string, unknown> | null) {
    const model = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(doc),
        }),
      }),
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(doc ? [doc] : []),
        }),
      }),
    };
    return new MongoDungeonMapsRepository(model as never);
  }

  function docWith(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(id),
      name: 'Mapa',
      gridType: 'square',
      gridWidth: 20,
      gridHeight: 20,
      cellSize: 40,
      theme: 'dyson',
      cells: [],
      decorations: [],
      notes: [],
      ...overrides,
    };
  }

  // Jádro dluhu: dřív vracelo 'dungeon'.
  it.each(MAP_KINDS)('zachová mapKind = %s', async (kind) => {
    const repo = makeRepo(docWith({ mapKind: kind }));
    const result = await repo.findById(id);
    expect(result?.mapKind).toBe(kind);
  });

  it('projde i přes findAll (stejné toEntity, jiná cesta)', async () => {
    const repo = makeRepo(docWith({ mapKind: 'wilderness' }));
    const [result] = await repo.findAll();
    expect(result.mapKind).toBe('wilderness');
  });

  it('legacy dokument bez mapKind zůstane bez pole (nedoplňuje se)', async () => {
    const repo = makeRepo(docWith());
    const result = await repo.findById(id);
    expect(result?.mapKind).toBeUndefined();
  });

  it('neznámou hodnotu z DB srazí na dungeon (obrana proti ručnímu zásahu)', async () => {
    const repo = makeRepo(docWith({ mapKind: 'atlantida' }));
    const result = await repo.findById(id);
    expect(result?.mapKind).toBe('dungeon');
  });

  // Ostatní výčtová pole měla stejný ternární vzor. Dnes mají po dvou
  // hodnotách, takže nekolabovala — test je pojistka pro chvíli, kdy
  // někdo přidá třetí (přesně tak vznikl D-077).
  it.each([
    ['gridType', 'hex', 'hex'],
    ['gridType', 'nesmysl', 'square'],
    ['theme', 'modern', 'modern'],
    ['theme', 'nesmysl', 'dyson'],
  ])('%s = %s → %s', async (field, value, expected) => {
    const repo = makeRepo(docWith({ [field]: value }));
    const result = await repo.findById(id);
    expect(result?.[field as 'gridType' | 'theme']).toBe(expected);
  });

  it('chybějící gridType/theme dostanou default', async () => {
    const doc = docWith();
    delete (doc as Record<string, unknown>).gridType;
    delete (doc as Record<string, unknown>).theme;
    const repo = makeRepo(doc);
    const result = await repo.findById(id);
    expect(result?.gridType).toBe('square');
    expect(result?.theme).toBe('dyson');
  });
});
