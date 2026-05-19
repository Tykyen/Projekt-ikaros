/**
 * Krok 5.7a — migrace vzhledů světa po reformě.
 *
 * Reforma 5.7 zrušila 16 world-only skinů a 21 motivů přepnula na
 * `platform`. Jediný platný světový vzhled je nyní `ikaros`. Tato migrace:
 *
 *  1. `themeId` — každý svět s jiným než `ikaros` → `ikaros`
 *     (staré world-only slugy i platform-only slugy jsou pro svět neplatné).
 *  2. `genre` — přemapuje 31 starých žánrů na nových 11 (viz GENRE_MAP);
 *     neznámé / „Vlastní" / custom free-text se nechávají beze změny.
 *  3. `themeBackgroundUrl` — prázdný řetězec ('') se odstraní (FE i tak
 *     fallbackuje, ale DB má být čistá; '' ≠ „žádné pozadí").
 *
 * Idempotentní — re-run nemá efekt (světy už mají `ikaros` / nový žánr).
 *
 * ⚠️ Před spuštěním doporučeno `mongodump` — migrace přepisuje `themeId`
 *    a `genre`. `--dry-run` jen vypíše počty, nic nemění.
 *
 * Použití (z backend/):
 *   MONGODB_URI=mongodb://localhost:27017/ikaros npx ts-node scripts/migrate-world-theme-5.7/index.ts
 *   npx ts-node scripts/migrate-world-theme-5.7/index.ts --dry-run
 */
import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
const DRY_RUN = process.argv.includes('--dry-run');

const WORLD_THEME = 'ikaros';

/** Mapování 31 starých žánrů → 11 nových (krok 5.7, spec-5.7a příloha A). */
const GENRE_MAP: Record<string, string> = {
  // → Fantasy
  'Heroic fantasy': 'Fantasy',
  'Sword and sorcery': 'Fantasy',
  'Mythic / mytologický': 'Fantasy',
  // → Dark Fantasy
  'Dark fantasy': 'Dark Fantasy',
  Grimdark: 'Dark Fantasy',
  'Urban fantasy': 'Dark Fantasy',
  // → Sci-Fi
  'Sci-fi': 'Sci-Fi',
  'Hard sci-fi': 'Sci-Fi',
  'Soft sci-fi': 'Sci-Fi',
  'Space opera': 'Sci-Fi',
  // → Cyberpunk
  Biopunk: 'Cyberpunk',
  // → Steampunk
  Dieselpunk: 'Steampunk',
  // → Post-apokalypsa
  Postapo: 'Post-apokalypsa',
  'Post-postapo': 'Post-apokalypsa',
  Survival: 'Post-apokalypsa',
  // → Horor
  Horor: 'Horor',
  'Psychologický horor': 'Horor',
  'Lovecraftovský / kosmický horor': 'Horor',
  // → Mystery
  'Detektivní / mystery': 'Mystery',
  Thriller: 'Mystery',
  'Weird fiction': 'Mystery',
  // → Historický
  'Alternativní historie': 'Historický',
  'Politické drama': 'Historický',
  // → Současnost
  Dystopie: 'Současnost',
  'Utopie / falešná utopie': 'Současnost',
  Military: 'Současnost',
  Pulp: 'Současnost',
  Superhrdinský: 'Současnost',
};

async function main(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  const worlds = mongoose.connection.collection('worlds');

  // 1. themeId → ikaros
  const themeMismatch = await worlds.countDocuments({
    themeId: { $ne: WORLD_THEME },
  });

  // 2. genre přemapování — počty per starý žánr
  const genrePlan: { from: string; to: string; count: number }[] = [];
  for (const [from, to] of Object.entries(GENRE_MAP)) {
    const count = await worlds.countDocuments({ genre: from });
    if (count > 0) genrePlan.push({ from, to, count });
  }

  // 3. prázdný themeBackgroundUrl
  const emptyBg = await worlds.countDocuments({ themeBackgroundUrl: '' });

  console.log(`Světů s themeId ≠ '${WORLD_THEME}': ${themeMismatch}`);
  console.log(`Žánrů k přemapování: ${genrePlan.length} typů`);
  for (const g of genrePlan) {
    console.log(`  '${g.from}' → '${g.to}': ${g.count}`);
  }
  console.log(`Světů s prázdným themeBackgroundUrl: ${emptyBg}`);

  if (DRY_RUN) {
    console.log('[dry-run] — nic nezměněno.');
    await mongoose.disconnect();
    return;
  }

  const themeRes = await worlds.updateMany(
    { themeId: { $ne: WORLD_THEME } },
    { $set: { themeId: WORLD_THEME } },
  );
  console.log(`themeId → '${WORLD_THEME}': ${themeRes.modifiedCount}`);

  let genreModified = 0;
  for (const g of genrePlan) {
    const res = await worlds.updateMany(
      { genre: g.from },
      { $set: { genre: g.to } },
    );
    genreModified += res.modifiedCount;
  }
  console.log(`genre přemapováno: ${genreModified}`);

  const bgRes = await worlds.updateMany(
    { themeBackgroundUrl: '' },
    { $unset: { themeBackgroundUrl: '' } },
  );
  console.log(`prázdný themeBackgroundUrl odstraněn: ${bgRes.modifiedCount}`);

  console.log('Hotovo.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migrace selhala:', err);
  process.exit(1);
});
