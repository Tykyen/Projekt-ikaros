/* eslint-disable no-console */
/**
 * D-8.6-accessLocation-backfill — Pokus o automatický překlad starého
 * free-text `accessLocation` (z původního CharacterFinance v 8.1c) na
 * nový `accessLocation: { type:'character', characterId }`.
 *
 * Hlavní migrace `migrate-finance-multi-account-8.6` nastavila `accessLocation`
 * na `null`, protože staré pole bylo free text bez záruky. Tento skript:
 *
 *  1. Najde všechny `character_accounts` s `accessLocation === null` a `notes`
 *     nebo `label` obsahující jméno postavy.
 *  2. Pokusí se najít kandidáta v `characters` (case-insensitive, NFD normalize).
 *  3. Pokud najde **jednoznačný match v daném `worldId`**, nastaví `accessLocation`.
 *
 * Idempotentní — skipuje účty, které už mají `accessLocation`.
 *
 * Heuristika je opatrná — preferuje žádnou změnu před špatnou. Manuální
 * doplnění přes UI „Nastavení účtu" zůstává.
 *
 * Spouštět:
 *   MONGODB_URI=mongodb://... ts-node scripts/migrate-account-access-location-8.6/index.ts [--dry-run]
 */
import mongoose from 'mongoose';

interface CliArgs {
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  return { dryRun: argv.slice(2).includes('--dry-run') };
}

interface AccountDoc {
  _id: mongoose.Types.ObjectId;
  worldId: string;
  label: string;
  accessLocation: unknown;
  // Z legacy dat (po hlavní migraci) se mohlo dostat free text v notes header.
  notes?: string;
}

interface CharacterDoc {
  _id: mongoose.Types.ObjectId;
  worldId: string;
  name: string;
  slug: string;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No MongoDB connection');

  const accounts = db.collection<AccountDoc>('character_accounts');
  const characters = db.collection<CharacterDoc>('characters');

  const candidates = await accounts.find({ accessLocation: null }).toArray();
  console.log(
    `[backfill] Nalezeno ${candidates.length} účtů bez accessLocation`,
  );

  let matched = 0;
  let skipped = 0;

  for (const acc of candidates) {
    // Heuristika: hledáme v `label` nebo `notes` (prvních 100 znaků)
    // jméno postavy stejného světa.
    const haystack = normalize(
      `${acc.label} ${(acc.notes ?? '').slice(0, 200)}`,
    );
    if (!haystack) {
      skipped++;
      continue;
    }

    const worldCharacters = await characters
      .find({ worldId: acc.worldId })
      .toArray();

    const matches = worldCharacters.filter((c) =>
      haystack.includes(normalize(c.name)),
    );

    if (matches.length !== 1) {
      // Ambiguous nebo žádný match → nech null.
      skipped++;
      continue;
    }

    const candidate = matches[0];
    if (dryRun) {
      console.log(
        `[dry-run] Account ${acc._id} (${acc.label}) → ${candidate.name} (${candidate._id})`,
      );
    } else {
      await accounts.updateOne(
        { _id: acc._id },
        {
          $set: {
            accessLocation: {
              type: 'character',
              characterId: String(candidate._id),
            },
          },
        },
      );
    }
    matched++;
  }

  console.log(`[backfill] Matched: ${matched}, Skipped: ${skipped}`);
  if (dryRun) console.log('[backfill] Dry run — no changes written');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[backfill] Failed:', err);
  process.exit(1);
});
