/**
 * D-NAMESORT — backfill řadicího klíče do 8 komunitních katalogů.
 *
 * Dopočítá `nameSort` (u riddles `questionSort`) = foldSortKey(zdroj) pro
 * existující dokumenty, které klíč nemají nebo mají neaktuální. Nové/updatnuté
 * dokumenty už klíč dostávají hookem (`sortKeyPlugin`), tohle je jen jednorázový
 * dohon historie.
 *
 * IDEMPOTENTNÍ — přepočítá klíč a zapíše jen tam, kde se liší; re-run nic nedělá.
 * Default dry-run; skutečný zápis přidej `--apply`.
 *
 * Spouštěj (z adresáře backend/):
 *   MONGODB_URI=mongodb://... npx tsx scripts/backfill-name-sort/index.ts [--apply]
 */
import mongoose from 'mongoose';
import { foldSortKey } from '../../src/common/utils/name-sort';

/** Kolekce → zdrojové pole (identita) a cílový řadicí klíč. */
const TARGETS: {
  collection: string;
  source: string;
  target: string;
}[] = [
  { collection: 'bestiae', source: 'name', target: 'nameSort' },
  { collection: 'spells', source: 'name', target: 'nameSort' },
  { collection: 'community_items', source: 'name', target: 'nameSort' },
  { collection: 'potions', source: 'name', target: 'nameSort' },
  { collection: 'plants', source: 'name', target: 'nameSort' },
  { collection: 'price_lists', source: 'name', target: 'nameSort' },
  { collection: 'riddles', source: 'question', target: 'questionSort' },
  { collection: 'name_sets', source: 'name', target: 'nameSort' },
];

function parseArgs(argv: string[]): { apply: boolean } {
  return { apply: argv.slice(2).includes('--apply') };
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';

  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (!apply)
    console.log(
      '🧪 DRY RUN — žádný zápis (použij --apply pro skutečný backfill)',
    );

  await mongoose.connect(uri);

  let grandTotal = 0;
  let grandChanged = 0;
  try {
    for (const { collection, source, target } of TARGETS) {
      const col = mongoose.connection.collection(collection);
      const cursor = col.find(
        {},
        { projection: { _id: 1, [source]: 1, [target]: 1 } },
      );

      let total = 0;
      let changed = 0;
      const ops: {
        updateOne: {
          filter: Record<string, unknown>;
          update: Record<string, unknown>;
        };
      }[] = [];

      for await (const doc of cursor) {
        total++;
        const next = foldSortKey((doc as Record<string, unknown>)[source]);
        const current = (doc as Record<string, unknown>)[target];
        if (current === next) continue;
        changed++;
        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { [target]: next } },
          },
        });
        if (apply && ops.length >= 500) {
          await col.bulkWrite(ops);
          ops.length = 0;
        }
      }
      if (apply && ops.length > 0) await col.bulkWrite(ops);

      grandTotal += total;
      grandChanged += changed;
      console.log(
        `   ${collection.padEnd(16)} ${String(total).padStart(6)} docs · ` +
          `${apply ? 'zapsáno' : 'k zápisu'} ${changed} × ${target}`,
      );
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`✨ Backfill ${apply ? 'dokončen' : '(dry-run)'}`);
    console.log(`   Dokumentů celkem:  ${grandTotal}`);
    console.log(`   ${apply ? 'Zapsáno' : 'K zápisu'} klíčů: ${grandChanged}`);
    console.log('═══════════════════════════════════════════');
    if (!apply) console.log('\n🚀 Pro skutečný zápis spusť znovu s `--apply`.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('💥 Backfill selhal:', err);
  process.exit(1);
});
