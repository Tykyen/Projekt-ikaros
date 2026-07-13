/**
 * D-19.2 — toEntity whitelist test: `imageBytes` (velikost blobu podkladu)
 * musí projít read-mapperem, jinak by se uložená hodnota při GET ztratila
 * (be_field_check: schema/DTO/service/toEntity).
 */
import { MongoWorldMapsRepository } from './world-maps.repository';
import type { Model } from 'mongoose';
import type { WorldMapEntrySchemaClass } from '../schemas/world-map-entry.schema';

describe('MongoWorldMapsRepository — toEntry (D-19.2)', () => {
  const doc = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    worldId: 'w1',
    folderId: null,
    title: 'Mapa',
    description: '',
    imageUrl: 'https://cdn/m.png',
    order: 0,
    isPublic: false,
    visibleToPlayerIds: [],
    pins: [],
    linkedSceneId: null,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    ...over,
  });

  const makeRepo = (docs: Record<string, unknown>[]) => {
    const model = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(docs),
          }),
        }),
      }),
    } as unknown as Model<WorldMapEntrySchemaClass>;
    return new MongoWorldMapsRepository(model);
  };

  it('D-19.2 — imageBytes projde toEntry (whitelist)', async () => {
    const repo = makeRepo([doc({ imageBytes: 123_456 })]);
    const [entry] = await repo.findByWorld('w1');
    expect(entry.imageBytes).toBe(123_456);
  });

  it('D-19.2 — starý dokument bez imageBytes → undefined (žádný default)', async () => {
    const repo = makeRepo([doc()]);
    const [entry] = await repo.findByWorld('w1');
    expect(entry.imageBytes).toBeUndefined();
  });
});
