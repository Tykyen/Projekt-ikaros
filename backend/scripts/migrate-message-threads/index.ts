import mongoose from 'mongoose';
import { buildBackfillOp, MISSING_CONVERSATION_FILTER } from './backfill';

// Spouštěj: `MONGODB_URI=... npm run migrate:message-threads [-- --dry-run]`

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.slice(2).includes('--dry-run') };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  await mongoose.connect(uri);

  try {
    const collection = mongoose.connection.collection('ikarosmessages');
    const count = await collection.countDocuments(MISSING_CONVERSATION_FILTER);
    console.log(`📄 Zpráv bez conversationId: ${count}`);

    if (dryRun) {
      console.log('🧪 DRY RUN — žádný zápis do DB');
      return;
    }
    if (count === 0) {
      console.log('✅ Nic k migraci (idempotentní).');
      return;
    }

    const cursor = collection.find(MISSING_CONVERSATION_FILTER, {
      projection: { _id: 1 },
    });
    let modified = 0;
    let batch: ReturnType<typeof buildBackfillOp>[] = [];

    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;
      const res = await collection.bulkWrite(batch, { ordered: false });
      modified += res.modifiedCount;
      batch = [];
    };

    for await (const doc of cursor) {
      batch.push(buildBackfillOp(String(doc._id)));
      if (batch.length >= 500) await flush();
    }
    await flush();

    console.log(`✨ Migrace OK — modified: ${modified}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
