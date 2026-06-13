import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

export interface TestDb {
  mongo: MongoMemoryServer | MongoMemoryReplSet;
  uri: string;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  return {
    mongo,
    uri,
    stop: async () => {
      await mongo.stop();
    },
  };
}

/**
 * Replica-set varianta in-memory Mongo. Nutná pro testy cest, které používají
 * `session.startTransaction()` (membership approve, finance transfer, kaskádní
 * create/delete) — standalone `MongoMemoryServer` transakce neumí a kód buď
 * tiše neběží transakčně, nebo hodí „Transaction numbers are only allowed on a
 * replica set member". Seed-scenario gauntlet (FA/RC osy) ji vyžaduje.
 * Pomalejší start než standalone → použij přes `createTestApp({ replSet: true })`
 * s jedním sdíleným `beforeAll`, ne per-test fresh DB.
 */
export async function startTestReplDb(): Promise<TestDb> {
  // Default launch timeout 10 s je pod zátěží plné e2e sady na replica-set mongod
  // málo (boot pomalejší než standalone) → flaky „failed to start within 10000ms".
  process.env.MONGOMS_LAUNCH_TIMEOUT ??= '60000';
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongo.getUri();
  return {
    mongo,
    uri,
    stop: async () => {
      await mongo.stop();
    },
  };
}

export async function clearAllCollections(
  connection: mongoose.Connection,
): Promise<void> {
  const collections = await connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}
