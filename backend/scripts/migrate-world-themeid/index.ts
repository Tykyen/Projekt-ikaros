/**
 * Krok 5.0 — migrace `themeId` na existující světy.
 *
 * Doplní `themeId: 'modre-nebe'` (= DEFAULT_THEME) světům, které pole nemají
 * (vznikly před jeho zavedením). Motiv se nově odvozuje ze žánru světa ve
 * wizardu; tato migrace jen sjednotí starší dokumenty.
 *
 * Idempotentní — re-run nemá efekt (filtr `themeId: { $exists: false }`).
 * Pozn.: i bez migrace FE funguje — `toEntity` fallbackuje na `'modre-nebe'`.
 * Matrix svět řeší `MatrixWorldSeed` (vlastní pozadí).
 *
 * Použití (z backend/):
 *   MONGODB_URI=mongodb://localhost:27017/ikaros npx ts-node scripts/migrate-world-themeid/index.ts
 *   npx ts-node scripts/migrate-world-themeid/index.ts --dry-run
 */
import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  const worlds = mongoose.connection.collection('worlds');

  const missing = await worlds.countDocuments({ themeId: { $exists: false } });
  console.log(`Světů bez themeId: ${missing}`);

  if (DRY_RUN) {
    console.log(`[dry-run] → 'modre-nebe': ${missing}`);
    await mongoose.disconnect();
    return;
  }

  const res = await worlds.updateMany(
    { themeId: { $exists: false } },
    { $set: { themeId: 'modre-nebe' } },
  );

  console.log(`Hotovo — themeId doplněn: ${res.modifiedCount}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migrace selhala:', err);
  process.exit(1);
});
