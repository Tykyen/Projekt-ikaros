/**
 * Integration test pro DiarySchemaVersions repository.
 *
 * Ověřuje race condition popsanou v dluhy.md: paralelní create stejné version
 * narazí na compound unique index `(worldId, version)` a druhý request dostane
 * `MongoServerError` (E11000 duplicate key). Bez retry logiky výše to znamená
 * 500 pro jednoho ze dvou souběžných PJ.
 *
 * Test používá `mongodb-memory-server` — ephemerální Mongo instance v paměti.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import {
  DiarySchemaVersionSchema,
  DiarySchemaVersionSchemaClass,
} from './diary-schema-versions.schema';

describe('DiarySchemaVersions — integration concurrency', () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let model: mongoose.Model<DiarySchemaVersionSchemaClass>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongo.getUri()).asPromise();
    model = connection.model<DiarySchemaVersionSchemaClass>(
      DiarySchemaVersionSchemaClass.name,
      DiarySchemaVersionSchema,
    );
    // Mongoose vytvoří indexy lazy. Pro test compound unique force build.
    await model.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  it('compound unique index (worldId, version) odmítne duplikát', async () => {
    await model.collection.insertOne({
      worldId: 'W1',
      version: 1,
      system: 'dnd5e',
      schema: [],
      archivedAt: new Date(),
    });

    await expect(
      model.collection.insertOne({
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: [],
        archivedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('paralelní create stejné version: 1 uspěje, 1 selže s E11000', async () => {
    const results = await Promise.allSettled([
      model.collection.insertOne({
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: [],
        archivedAt: new Date(),
      }),
      model.collection.insertOne({
        worldId: 'W1',
        version: 1,
        system: 'pathfinder',
        schema: [],
        archivedAt: new Date(),
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 11000 });
  });

  it('různé worldId smí mít stejnou version (index je per-world)', async () => {
    const results = await Promise.allSettled([
      model.collection.insertOne({
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: [],
        archivedAt: new Date(),
      }),
      model.collection.insertOne({
        worldId: 'W2',
        version: 1,
        system: 'dnd5e',
        schema: [],
        archivedAt: new Date(),
      }),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('findLastVersion + create N je race-prone bez retry/atomic counter', async () => {
    // Reprodukce vzoru `findLastVersion + 1` v WorldsService.update().
    // Dvě paralelní volání čtou last=0, oba zkusí vytvořit version=1.
    const findLastVersion = async (worldId: string): Promise<number> => {
      const doc = await model.collection.findOne(
        { worldId },
        { sort: { version: -1 } },
      );
      return (doc?.version as number | undefined) ?? 0;
    };

    const racingCreate = async (system: string) => {
      const last = await findLastVersion('W1');
      return model.collection.insertOne({
        worldId: 'W1',
        version: last + 1,
        system,
        schema: [],
        archivedAt: new Date(),
      });
    };

    const results = await Promise.allSettled([
      racingCreate('dnd5e'),
      racingCreate('pathfinder'),
    ]);

    // Jeden uspěje, druhý dostane E11000 — to je důvod, proč WorldsService
    // potřebuje retry logiku nebo atomic counter (per dluhy.md follow-up).
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    expect(fulfilled).toBe(1);
    expect(rejected).toBe(1);
  });
});
