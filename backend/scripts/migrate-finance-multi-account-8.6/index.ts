/* eslint-disable no-console */
/**
 * 8.6 — Migrace single Finance subdoc → multi-account model.
 *
 * Pro každý existující `CharacterFinance` dokument:
 *   1. Vytvoří 1 účet v `character_accounts` s label="Hlavní účet", primaryOwner=characterId,
 *      ownerCharacterIds=[characterId], a překopíruje accountType/accessLocation/currency/
 *      balance/transactions/notes.
 *   2. `entries[]` rozdělí podle znaménka `amount`:
 *      - kladné → `incomeEntries[]`
 *      - záporné → `expenseEntries[]` (s abs hodnotou)
 *   3. `CharacterFinance` doc nechá jako kontejner — odstraní z něj přesunutá pole
 *      (accountType, accessLocation, currency, balance, entries, transactions, notes).
 *      Pole `isHidden` zachová.
 *
 * Idempotentní: skip pokud už existuje account s `primaryOwnerId == characterId`.
 *
 * Spouštět:
 *   MONGODB_URI=mongodb://... ts-node scripts/migrate-finance-multi-account-8.6/index.ts [--dry-run]
 *
 * BEZPEČNOST: před spuštěním zálohuj `character_finances` collection
 * (`mongodump --db ikaros --collection character_finances`).
 */
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

interface CliArgs {
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  return { dryRun: argv.slice(2).includes('--dry-run') };
}

interface OldFinanceDoc {
  _id: mongoose.Types.ObjectId;
  characterId: string;
  isHidden?: boolean;
  accountType?: string;
  accessLocation?: string;
  currency?: string;
  balance?: number;
  entries?: { id: string; label: string; amount: number }[];
  transactions?: Record<string, unknown>[];
  notes?: string;
}

interface CharacterDoc {
  _id: mongoose.Types.ObjectId;
  worldId: string;
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv);

  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  console.log(
    `[migrate-8.6] Connecting to ${uri.replace(/:[^:@/]+@/, ':***@')}`,
  );
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No MongoDB connection');

  const finances = db.collection('character_finances');
  const accounts = db.collection('character_accounts');
  const characters = db.collection<CharacterDoc>('characters');

  const allFinances = await finances.find<OldFinanceDoc>({}).toArray();
  console.log(`[migrate-8.6] Found ${allFinances.length} finance docs`);

  let migrated = 0;
  let skipped = 0;
  let dropped = 0;

  for (const fin of allFinances) {
    if (!fin.characterId) {
      console.warn(
        `[migrate-8.6] Skipping finance ${fin._id} — no characterId`,
      );
      dropped++;
      continue;
    }

    // Idempotent guard
    const existing = await accounts.findOne({
      primaryOwnerId: fin.characterId,
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Najdi character pro worldId
    let charObjectId: mongoose.Types.ObjectId | null = null;
    try {
      charObjectId = new mongoose.Types.ObjectId(fin.characterId);
    } catch {
      charObjectId = null;
    }
    const character = charObjectId
      ? await characters.findOne({ _id: charObjectId })
      : null;
    if (!character) {
      console.warn(
        `[migrate-8.6] Skipping finance ${fin._id} — character ${fin.characterId} not found`,
      );
      dropped++;
      continue;
    }

    const entries = fin.entries ?? [];
    const incomeEntries = entries
      .filter((e) => e.amount >= 0)
      .map((e) => ({
        id: e.id ?? randomUUID(),
        label: e.label ?? '',
        amount: e.amount,
      }));
    const expenseEntries = entries
      .filter((e) => e.amount < 0)
      .map((e) => ({
        id: e.id ?? randomUUID(),
        label: e.label ?? '',
        amount: Math.abs(e.amount),
      }));

    const accountDoc = {
      worldId: character.worldId,
      label: 'Hlavní účet',
      ownerCharacterIds: [fin.characterId],
      primaryOwnerId: fin.characterId,
      accountType: fin.accountType || 'Osobní',
      accessLocation: null, // staré free text se nepřevádí; PJ doplní
      currency: fin.currency || 'MNC',
      balance: fin.balance ?? 0,
      incomeEntries,
      expenseEntries,
      transactions: fin.transactions ?? [],
      notes: fin.notes ?? '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (dryRun) {
      console.log(
        `[dry-run] Would create account for character ${fin.characterId} (currency ${accountDoc.currency}, balance ${accountDoc.balance}, ${incomeEntries.length} income + ${expenseEntries.length} expense)`,
      );
    } else {
      await accounts.insertOne(accountDoc);
      // Vyčistit staré pole na finance dokumentu
      await finances.updateOne(
        { _id: fin._id },
        {
          $unset: {
            accountType: '',
            accessLocation: '',
            currency: '',
            balance: '',
            entries: '',
            transactions: '',
            notes: '',
          },
        },
      );
    }
    migrated++;
  }

  console.log(`[migrate-8.6] Migrated: ${migrated}`);
  console.log(`[migrate-8.6] Skipped (already migrated): ${skipped}`);
  console.log(`[migrate-8.6] Dropped (invalid): ${dropped}`);
  if (dryRun) console.log('[migrate-8.6] Dry run — no changes written');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[migrate-8.6] Migration failed:', err);
  process.exit(1);
});
