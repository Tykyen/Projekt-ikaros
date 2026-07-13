/* eslint-disable no-console */
/**
 * D-NEW-INV-DATA-SYNC (cleanup) — smaže orphan finance/inventory subdocy
 * NPC a Lokací.
 *
 * Kontext: `onCharacterCreated` dřív zakládal finance + inventory KAŽDÉ
 * entitě (8.1-FIR), ale `getFinance`/`getInventory` je pro NPC/Lokaci
 * blokuje 404 `*_NOT_APPLICABLE` (EC-03) → nečitelná orphan data. Kaskáda
 * je od 2026-07-12 opravená (zakládá jen pro PC); tento skript uklidí
 * historické dokumenty.
 *
 * BEZPEČNOSTNÍ PRAVIDLO — maže se JEN prázdný subdoc (stav po create):
 *   - finance:   balance 0/chybí ∧ entries prázdné ∧ transactions prázdné
 *                ∧ notes prázdné
 *   - inventory: sections prázdné ∧ notes prázdné
 * Neprázdné dokumenty se NEmažou: PC→NPC konverze subdoc jen skrývá
 * (isHidden) a zpětná NPC→PC konverze ho odkryje — data musí přežít
 * round-trip (A→B→A). Stejně tak data z Matrix migrace.
 *
 * Skript je IDEMPOTENTNÍ (mazání už smazaných = no-op).
 *
 * Spouštěj:
 *   MONGODB_URI=mongodb://... ts-node scripts/cleanup-npc-lokace-finance-inventory/index.ts [--dry-run] [--world=<id>]
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

/** `subdoc.characterId` je string podoba `Character._id` (viz repo create). */
const CHUNK_SIZE = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Prázdný finance subdoc = přesně stav po `financeRepo.create`. */
function emptyFinanceFilter(ids: string[]): Record<string, unknown> {
  return {
    characterId: { $in: ids },
    balance: { $in: [0, null] },
    'entries.0': { $exists: false },
    'transactions.0': { $exists: false },
    notes: { $in: ['', null] },
  };
}

/** Prázdný inventory subdoc = přesně stav po `inventoryRepo.create`. */
function emptyInventoryFilter(ids: string[]): Record<string, unknown> {
  return {
    characterId: { $in: ids },
    'sections.0': { $exists: false },
    notes: { $in: ['', null] },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';

  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (args.dryRun) console.log('🧪 DRY RUN — žádný zápis do DB');
  if (args.worldFilter) console.log(`🌍 Filter na svět: ${args.worldFilter}`);

  await mongoose.connect(uri);

  try {
    const charactersCol = mongoose.connection.collection('characters');
    const financesCol = mongoose.connection.collection('character_finances');
    const inventoriesCol = mongoose.connection.collection(
      'character_inventories',
    );

    // NPC + Lokace — entity, pro které getFinance/getInventory vrací 404
    // (EC-03), takže jejich finance/inventory subdoc je nečitelný orphan.
    const characterFilter: Record<string, unknown> = {
      $or: [{ isNpc: true }, { kind: 'location' }],
    };
    if (args.worldFilter) characterFilter.worldId = args.worldFilter;

    const npcLokaceIds = (
      await charactersCol
        .find(characterFilter, { projection: { _id: 1 } })
        .toArray()
    ).map((d) => String(d._id));

    console.log(`📋 NPC/Lokace postav celkem: ${npcLokaceIds.length}`);
    if (npcLokaceIds.length === 0) {
      console.log('✅ Nic k úklidu.');
      return;
    }

    let financeCandidates = 0;
    let inventoryCandidates = 0;
    let financeSkippedNonEmpty = 0;
    let inventorySkippedNonEmpty = 0;
    let financeDeleted = 0;
    let inventoryDeleted = 0;

    for (const ids of chunk(npcLokaceIds, CHUNK_SIZE)) {
      const [finEmpty, finAll, invEmpty, invAll] = await Promise.all([
        financesCol.countDocuments(emptyFinanceFilter(ids)),
        financesCol.countDocuments({ characterId: { $in: ids } }),
        inventoriesCol.countDocuments(emptyInventoryFilter(ids)),
        inventoriesCol.countDocuments({ characterId: { $in: ids } }),
      ]);
      financeCandidates += finEmpty;
      inventoryCandidates += invEmpty;
      financeSkippedNonEmpty += finAll - finEmpty;
      inventorySkippedNonEmpty += invAll - invEmpty;

      if (!args.dryRun) {
        const [finRes, invRes] = await Promise.all([
          financesCol.deleteMany(emptyFinanceFilter(ids)),
          inventoriesCol.deleteMany(emptyInventoryFilter(ids)),
        ]);
        financeDeleted += finRes.deletedCount;
        inventoryDeleted += invRes.deletedCount;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    if (args.dryRun) {
      console.log('🧪 DRY RUN — souhrn (nic nesmazáno):');
      console.log(`   finance k smazání (prázdné):    ${financeCandidates}`);
      console.log(`   inventory k smazání (prázdné):  ${inventoryCandidates}`);
    } else {
      console.log('✨ Cleanup dokončen');
      console.log(`   finance smazáno:    ${financeDeleted}`);
      console.log(`   inventory smazáno:  ${inventoryDeleted}`);
    }
    console.log(
      `   ponecháno s daty (finance):   ${financeSkippedNonEmpty} — konverze PC→NPC / Matrix migrace`,
    );
    console.log(
      `   ponecháno s daty (inventory): ${inventorySkippedNonEmpty} — konverze PC→NPC / Matrix migrace`,
    );
    console.log('═══════════════════════════════════════════');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
