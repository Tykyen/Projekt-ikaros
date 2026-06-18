import mongoose from 'mongoose';

/**
 * Migrace: oprava unique indexu `channelId_1_clientNonce_1` na `chatmessages`.
 *
 * Starý index byl `{ unique: true, sparse: true }`. Protože je kompozitní a
 * `channelId` je vždy přítomný, `sparse` nevyřadil dokumenty s `clientNonce:null`
 * → každá 2. zpráva v global kanálu (Hospoda/Rozcestí, které nonce neposílají)
 * kolidovala na klíči `(channelId, null)` → E11000 → HTTP 409. Odeslání zprávy
 * v global chatu tím přestalo fungovat.
 *
 * Fix: nahradit za `partialFilterExpression: { clientNonce: { $type: 'string' } }`
 * → unique platí jen pro zprávy s reálným string nonce (world chat retry),
 * null/global zprávy se neindexují. Idempotence world chatu zůstává.
 *
 * Spouštěj: `MONGODB_URI=... npm run migrate:chatmessage-nonce-index [-- --dry-run]`
 */

const COLLECTION = 'chatmessages';
const INDEX_NAME = 'channelId_1_clientNonce_1';
const NEW_OPTIONS = {
  name: INDEX_NAME,
  unique: true as const,
  partialFilterExpression: { clientNonce: { $type: 'string' as const } },
};

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.slice(2).includes('--dry-run') };
}

interface IndexInfo {
  name?: string;
  key?: Record<string, unknown>;
  sparse?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  await mongoose.connect(uri);

  try {
    const collection = mongoose.connection.collection(COLLECTION);
    const indexes = (await collection.indexes()) as IndexInfo[];
    const existing = indexes.find((i) => i.name === INDEX_NAME);

    const isAlreadyPartial =
      existing?.partialFilterExpression !== undefined && !existing?.sparse;

    if (!existing) {
      console.log(
        `ℹ️  Index '${INDEX_NAME}' neexistuje — vytvořím nový partial.`,
      );
    } else if (isAlreadyPartial) {
      console.log('✅ Index už je partial — nic k migraci (idempotentní).');
      return;
    } else {
      console.log(
        `⚠️  Nalezen starý index '${INDEX_NAME}' (sparse=${String(existing.sparse)}) → drop + recreate jako partial.`,
      );
    }

    if (dryRun) {
      console.log('🧪 DRY RUN — žádná změna indexů.');
      return;
    }

    if (existing && !isAlreadyPartial) {
      await collection.dropIndex(INDEX_NAME);
      console.log(`🗑️  Starý index '${INDEX_NAME}' zahozen.`);
    }

    await collection.createIndex({ channelId: 1, clientNonce: 1 }, NEW_OPTIONS);
    console.log(`✨ Partial unique index '${INDEX_NAME}' vytvořen. Hotovo.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
