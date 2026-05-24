/* eslint-disable no-console */
/**
 * Krok 9.1 (cleanup) — Smaže duplicitní pole z Character entity, která jsou
 * po sjednocení Character → Page kanonicky uložená v Page entity.
 *
 * **Před spuštěním MUSÍ proběhnout `migrate-characters-to-pages-9.1`** —
 * tato migrace by jinak ztratila bio data postav, které ještě nemají
 * odpovídající Page mirror.
 *
 * Odstraňovaná pole:
 *   - publicBio          → Page.content
 *   - publicInfoBlocks   → Page.table.headers/values
 *   - privateBio         → Page.privateContent
 *   - privateInfoBlocks  → Page.privateInfoBlocks
 *   - accessRequirements → Page.accessRequirements
 *   - isLocation         → Page.type === 'Lokace'
 *   - imageUrl           → Page.imageUrl
 *
 * Ponechaná pole:
 *   - slug, name           — subdoc API lookup (`/characters/:slug/...`)
 *   - worldId, userId      — permission filter pro subdokumenty
 *   - isNpc                — PC vs NPC permission (owner check)
 *   - diaryData, extraBlocks, customData, campaignSubjectId — subdoc data
 *   - createdAt, updatedAt — timestamps
 *
 * Skript je IDEMPOTENTNÍ (`$unset` na neexistující pole je no-op).
 *
 * Spouštěj:
 *   MONGODB_URI=mongodb://... ts-node scripts/cleanup-character-duplicates-9.1/index.ts [--dry-run] [--world=<id>]
 */
import mongoose from 'mongoose';

interface CliArgs {
  dryRun: boolean;
  worldFilter: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let worldFilter: string | null = null;
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--world='))
      worldFilter = arg.slice('--world='.length);
  }
  return { dryRun, worldFilter };
}

const FIELDS_TO_UNSET = {
  publicBio: '',
  publicInfoBlocks: '',
  privateBio: '',
  privateInfoBlocks: '',
  accessRequirements: '',
  isLocation: '',
  imageUrl: '',
} as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';

  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (args.dryRun) console.log('🧪 DRY RUN — žádný zápis do DB');
  if (args.worldFilter) console.log(`🌍 Filter na svět: ${args.worldFilter}`);

  await mongoose.connect(uri);

  try {
    const pagesCol = mongoose.connection.collection('pages');
    const charactersCol = mongoose.connection.collection('characters');

    // Safety check — kolik Characters má odpovídající Page (characterRef)?
    // Pokud mezi Pages a Characters je velký rozpor, migrace 1. fáze
    // (migrate-characters-to-pages-9.1) ještě neproběhla — zastav.
    const characterFilter: Record<string, unknown> = {};
    if (args.worldFilter) characterFilter.worldId = args.worldFilter;

    const totalCharacters = await charactersCol.countDocuments(characterFilter);
    const charactersWithPage = await pagesCol.countDocuments({
      ...(args.worldFilter && { worldId: args.worldFilter }),
      'characterRef.characterId': { $exists: true },
    });

    console.log(`📋 Characters celkem:        ${totalCharacters}`);
    console.log(`📋 Pages s characterRef:     ${charactersWithPage}`);

    if (totalCharacters > charactersWithPage) {
      const missing = totalCharacters - charactersWithPage;
      console.error('');
      console.error(`❌ ZASTAVENO — ${missing} Characters NEMÁ Page mirror.`);
      console.error('   Spusť nejdřív `migrate-characters-to-pages-9.1`,');
      console.error(
        '   nebo dokonči manuálně mapping pro non-migrated postavy.',
      );
      console.error(
        '   Cleanup bez migrace by ZTRATIL bio data těchto postav.',
      );
      process.exit(1);
    }

    if (args.dryRun) {
      // Sample — co se smaže (prvních 5 dokumentů s alespoň 1 polem):
      const samples = await charactersCol
        .find(characterFilter, {
          projection: {
            slug: 1,
            ...Object.fromEntries(
              Object.keys(FIELDS_TO_UNSET).map((k) => [k, 1]),
            ),
          },
        })
        .limit(5)
        .toArray();

      console.log('');
      console.log('🧪 DRY RUN — sample dokumenty (jaká pole se smažou):');
      for (const s of samples) {
        const present = Object.keys(FIELDS_TO_UNSET).filter(
          (f) => s[f] !== undefined,
        );
        console.log(
          `   ${s.slug}: ${present.join(', ') || '(žádné — už cleanned)'}`,
        );
      }
      console.log('');
      console.log(
        `✅ Skript by provedl unset na ${totalCharacters} dokumentech.`,
      );
      return;
    }

    const result = await charactersCol.updateMany(characterFilter, {
      $unset: FIELDS_TO_UNSET,
    });

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`✨ Cleanup dokončen`);
    console.log(`   Matched dokumentů:  ${result.matchedCount}`);
    console.log(`   Modified dokumentů: ${result.modifiedCount}`);
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log(
      '⚠️ Character entity teď drží jen subdoc-related pole. Bio data jsou v Page.',
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
