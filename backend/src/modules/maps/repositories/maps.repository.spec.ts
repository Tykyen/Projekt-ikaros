import { Types } from 'mongoose';
import { MongoMapsRepository } from './maps.repository';

/**
 * D-066 regression — per-token `isLocked` field-drift.
 *
 * Zámek se zapsal do Mongo (Mixed token schema přijme cokoliv), ale read-mapper
 * `toToken` pole vynechal → GET token přišel bez `isLocked` → UI se po refetchi
 * „zamkne a hned odemkne". Test hlídá, že write→read round-trip zámek zachová.
 */
describe('MongoMapsRepository.toToken — D-066 isLocked', () => {
  function makeRepo(doc: Record<string, unknown> | null): MongoMapsRepository {
    const model = {
      findById: () => ({ lean: () => ({ exec: () => Promise.resolve(doc) }) }),
    };
    return new MongoMapsRepository(model as never);
  }

  it('GET vrací per-token isLocked = true (round-trip nezahodí zámek)', async () => {
    const id = new Types.ObjectId().toString();
    const repo = makeRepo({
      _id: id,
      worldId: 'w1',
      tokens: [{ id: 't1', characterId: 'c1', isLocked: true }],
    });

    const scene = await repo.findById(id);

    expect(scene?.tokens[0]?.isLocked).toBe(true);
  });

  it('default false když token pole isLocked nemá', async () => {
    const id = new Types.ObjectId().toString();
    const repo = makeRepo({
      _id: id,
      worldId: 'w1',
      tokens: [{ id: 't1', characterId: 'c1' }],
    });

    const scene = await repo.findById(id);

    expect(scene?.tokens[0]?.isLocked).toBe(false);
  });
});
