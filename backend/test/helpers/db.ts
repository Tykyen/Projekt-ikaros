import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

export interface TestDb {
  mongo: MongoMemoryServer;
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

export async function clearAllCollections(
  connection: mongoose.Connection,
): Promise<void> {
  const collections = await connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}
