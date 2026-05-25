/**
 * Spec 9.2c — Backfill CalendarEvent.start/end z legacy string formátu
 * `'YYYY-MM-DD'` na strukturovaný `FantasyDate` object
 * `{ year, monthIndex, day }`.
 *
 * Pro každý `character_calendars` doc:
 *   1. Pro každý event v `events[]`:
 *      - Pokud `start` je string ve formátu `YYYY-MM-DD` → parse na object.
 *      - Pokud `end` je string ve formátu `YYYY-MM-DD` → parse na object.
 *      - Pokud už je object → no-op.
 *      - Pokud chybí → no-op.
 *   2. Update doc atomicky pokud došlo ke změně.
 *
 * Idempotent (re-run no-op).
 *
 *   MONGODB_URI=... npx tsx scripts/backfill-calendar-event-fantasy-date-9.2c/index.ts [--apply] [--world=<id>]
 */
import mongoose from 'mongoose';

interface CliArgs {
  apply: boolean;
  worldFilter: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let apply = false;
  let worldFilter: string | null = null;
  for (const arg of argv.slice(2)) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--world='))
      worldFilter = arg.slice('--world='.length);
  }
  return { apply, worldFilter };
}

interface FantasyDate {
  year: number;
  monthIndex: number;
  day: number;
}

/** Parse `'YYYY-MM-DD'` → `{ year, monthIndex (0-based), day }` nebo null. */
function parseLegacyDate(value: unknown): FantasyDate | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    monthIndex: parseInt(m[2], 10) - 1,
    day: parseInt(m[3], 10),
  };
}

function isAlreadyObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'year' in value &&
    'monthIndex' in value &&
    'day' in value
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';

  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (!args.apply) console.log('🧪 DRY RUN — žádný zápis (použij --apply)');
  if (args.worldFilter) console.log(`🌍 Filter: ${args.worldFilter}`);

  await mongoose.connect(uri);

  try {
    const calendarsCol = mongoose.connection.collection('character_calendars');

    const filter: Record<string, unknown> = {};
    if (args.worldFilter) filter.worldId = args.worldFilter;

    const docs = await calendarsCol.find(filter).toArray();
    console.log('');
    console.log(`📋 Calendar docs: ${docs.length}`);

    let docsMigrated = 0;
    let eventsConverted = 0;
    let docsAlreadyDone = 0;

    for (const doc of docs) {
      const events = (doc.events as Record<string, unknown>[]) ?? [];
      let docChanged = false;
      const newEvents = events.map((e) => {
        let changed = false;
        const next = { ...e };
        if (e.start && !isAlreadyObject(e.start)) {
          const parsed = parseLegacyDate(e.start);
          if (parsed) {
            next.start = parsed;
            changed = true;
            eventsConverted++;
          }
        }
        if (e.end && !isAlreadyObject(e.end)) {
          const parsed = parseLegacyDate(e.end);
          if (parsed) {
            next.end = parsed;
            changed = true;
          }
        }
        if (changed) docChanged = true;
        return next;
      });

      if (!docChanged) {
        docsAlreadyDone++;
        continue;
      }

      if (!args.apply) {
        console.log(
          `   [dry] calendar=${String(doc._id)} characterId=${String(doc.characterId)} → ${newEvents.length} events updated`,
        );
      } else {
        await calendarsCol.updateOne(
          { _id: doc._id },
          { $set: { events: newEvents } },
        );
        console.log(
          `   [apply] calendar=${String(doc._id)} → ${newEvents.length} events migrated`,
        );
      }
      docsMigrated++;
    }

    console.log('');
    console.log('───────────────────────────────────────────');
    console.log(`Calendar docs total:        ${docs.length}`);
    console.log(`  → migrated:                ${docsMigrated}`);
    console.log(`  → already done (no-op):    ${docsAlreadyDone}`);
    console.log(`Events converted (total):   ${eventsConverted}`);

    if (!args.apply) {
      console.log('');
      console.log('🧪 Dry run dokončen. Pro reálný zápis spusť --apply.');
    } else {
      console.log('');
      console.log('✅ Migrace dokončena.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Migrace selhala:', err);
  process.exitCode = 1;
});
