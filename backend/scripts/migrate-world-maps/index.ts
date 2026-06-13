/* eslint-disable no-console */
import mongoose from 'mongoose';
import type { AnyBulkWriteOperation } from 'mongodb';

/**
 * 13.4b F1 — DB→DB migrace: embedded `worldMaps[].maps[]` → kolekce
 * `worldMapEntries` (1 dok/mapa). Idempotentní (upsert dle worldId+id),
 * lze spustit opakovaně. Spouštěj:
 *   MONGODB_URI=... npm run migrate:world-maps [-- --dry-run]
 */

interface LegacyMap {
  id: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  order?: number;
  isPublic?: boolean;
  visibleToPlayerIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}
interface LegacyDoc {
  worldId: string;
  maps?: LegacyMap[];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (dryRun) console.log('🧪 DRY RUN — žádný zápis');
  await mongoose.connect(uri);

  try {
    const legacy = mongoose.connection.collection('worldMaps');
    const target = mongoose.connection.collection('worldMapEntries');
    const docs = (await legacy.find({}).toArray()) as unknown as LegacyDoc[];

    const ops: AnyBulkWriteOperation[] = [];
    for (const doc of docs) {
      const maps = doc.maps ?? [];
      maps.forEach((m, i) => {
        if (!m.id) return; // bez id nelze idempotentně upsertovat
        const now = new Date().toISOString();
        const entry = {
          id: m.id,
          worldId: doc.worldId,
          folderId: null,
          title: m.title ?? '',
          description: m.description ?? '',
          imageUrl: m.imageUrl ?? '',
          order: m.order ?? i,
          isPublic: m.isPublic ?? false,
          visibleToPlayerIds: m.visibleToPlayerIds ?? [],
          createdAt: m.createdAt ?? now,
          updatedAt: m.updatedAt ?? now,
        };
        ops.push({
          updateOne: {
            filter: { worldId: doc.worldId, id: m.id },
            update: { $set: entry },
            upsert: true,
          },
        });
      });
    }

    console.log(
      `📄 Nalezeno ${docs.length} světů, ${ops.length} map k migraci.`,
    );
    if (dryRun || ops.length === 0) {
      console.log('Hotovo (dry-run nebo nic k migraci).');
      return;
    }
    const res = await target.bulkWrite(ops, { ordered: false });
    console.log(
      `✨ Migrace OK — upserts: ${res.upsertedCount}, modified: ${res.modifiedCount}, matched: ${res.matchedCount}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
