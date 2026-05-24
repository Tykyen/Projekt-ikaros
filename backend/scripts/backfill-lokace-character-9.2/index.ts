/* eslint-disable no-console */
/**
 * Spec 9.2 — Backfill skript pro existující Pages typu Lokace, které
 * po 9.1 cleanupu nemají `characterRef` (a tedy ani kalendář).
 *
 * Pro každou takovou Page:
 *   1. Vytvoří Character entity (`kind: 'location'`, `isNpc: false`,
 *      `slug = page.slug`, `name = page.title`, `worldId = page.worldId`).
 *   2. Vytvoří prázdný `charactercalendars` subdoc (events: [], color
 *      default, displaySettings: {}).
 *   3. Updatuje `page.characterRef.characterId = newCharacter._id`.
 *
 * Skript je **IDEMPOTENTNÍ** — filtr `characterRef: null` zajistí, že
 * re-spuštění na již migrovaných Lokacích nic neudělá.
 *
 * Default je dry-run. Pro skutečný zápis přidej `--apply`.
 *
 * Spouštěj:
 *   MONGODB_URI=mongodb://... npx tsx scripts/backfill-lokace-character-9.2/index.ts [--apply] [--world=<id>]
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

const DEFAULT_CALENDAR_COLOR = '#3B82F6';

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';

  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (!args.apply)
    console.log(
      '🧪 DRY RUN — žádný zápis do DB (použij --apply pro skutečnou migraci)',
    );
  if (args.worldFilter) console.log(`🌍 Filter na svět: ${args.worldFilter}`);

  await mongoose.connect(uri);

  try {
    const pagesCol = mongoose.connection.collection('pages');
    const charactersCol = mongoose.connection.collection('characters');
    const calendarsCol = mongoose.connection.collection('charactercalendars');

    const pageFilter: Record<string, unknown> = {
      type: 'Lokace',
      $or: [
        { characterRef: { $exists: false } },
        { characterRef: null },
        { 'characterRef.characterId': { $exists: false } },
      ],
    };
    if (args.worldFilter) pageFilter.worldId = args.worldFilter;

    const legacyPages = await pagesCol
      .find(pageFilter, {
        projection: { _id: 1, slug: 1, title: 1, worldId: 1 },
      })
      .toArray();

    console.log('');
    console.log(`📋 Legacy Lokace bez characterRef: ${legacyPages.length}`);
    if (legacyPages.length === 0) {
      console.log('✅ Nic k migraci — všechny Lokace už mají characterRef.');
      return;
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const page of legacyPages) {
      const slug = page.slug as string;
      const title = (page.title as string) ?? slug;
      const worldId = page.worldId as string;

      // Safety: existuje už Character se stejným worldId+slug? (race / re-run)
      const existing = await charactersCol.findOne({ worldId, slug });
      if (existing) {
        if (!args.apply) {
          console.log(
            `   [dry] ${slug} → Character už existuje (id=${String(existing._id)}), jen napojím characterRef`,
          );
        } else {
          await pagesCol.updateOne(
            { _id: page._id },
            { $set: { characterRef: { characterId: String(existing._id) } } },
          );
          console.log(
            `   [apply] ${slug} → re-linked existing Character ${String(existing._id)}`,
          );
        }
        skipped++;
        continue;
      }

      if (!args.apply) {
        console.log(
          `   [dry] ${slug} ("${title}") → vytvořit Character kind='location' + calendar subdoc + characterRef`,
        );
        created++;
        continue;
      }

      try {
        const now = new Date();
        const charRes = await charactersCol.insertOne({
          slug,
          name: title,
          worldId,
          kind: 'location',
          isNpc: false,
          diaryData: {},
          extraBlocks: [],
          customData: {},
          createdAt: now,
          updatedAt: now,
        });
        const characterId = String(charRes.insertedId);

        await calendarsCol.insertOne({
          characterId,
          worldId,
          color: DEFAULT_CALENDAR_COLOR,
          displaySettings: {},
          events: [],
          createdAt: now,
          updatedAt: now,
        });

        await pagesCol.updateOne(
          { _id: page._id },
          { $set: { characterRef: { characterId } } },
        );

        console.log(
          `   [apply] ${slug} → Character ${characterId} + empty calendar + linked`,
        );
        created++;
      } catch (e) {
        console.error(`   [error] ${slug}:`, e);
        errors++;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`✨ Backfill ${args.apply ? 'dokončen' : '(dry-run)'}`);
    console.log(`   Vytvořeno Characters: ${created}`);
    console.log(`   Re-linked existing:   ${skipped}`);
    if (errors > 0) console.log(`   Errors:               ${errors}`);
    console.log('═══════════════════════════════════════════');
    if (!args.apply) {
      console.log('');
      console.log('🚀 Pro skutečný zápis spusť znovu s `--apply`.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('💥 Backfill selhal:', err);
  process.exit(1);
});
