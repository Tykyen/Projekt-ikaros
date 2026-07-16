/**
 * 19.3b — povolené hodnoty `system` / `genre` na náboru (validace vstupu).
 *
 * ⚠️ **DUAL SOURCE — stejná past jako THEME_IDS.** Zdroj pravdy pro UI je FE
 * (`src/shared/rpg/systems.ts` = `PLATFORM_SYSTEMS`, `src/shared/rpg/genres.ts`
 * = `GENRES`). Tady je kopie jen proto, aby API neuteklo přes curl mimo
 * nabídku. **Přidáváš systém/žánr? Změň OBĚ místa.**
 *
 * Proč vůbec `@IsIn` a ne volný string: `system` byl volnotextový a `world.system`
 * do něj tekl jako id (`dnd5e`), zatímco lidé psali „D&D 5e" → jeden systém se
 * ve filtru rozpadl na několik. Uzavřený výčet to zavírá u vstupu.
 *
 * `system` = **canonical** id (FE ho normalizuje přes `resolveSystemId`, protože
 * `world.system` drží „dlouhá" id typu `drd-plus`). `genre` = **label**
 * (`world.genre` historicky ukládá label, ne id).
 */

/** Canonical engine id — parita s FE `PLATFORM_SYSTEMS`. */
export const NABOR_SYSTEM_IDS = [
  'generic',
  'dnd5e',
  'drd16',
  'drd2',
  'drdplus',
  'jad',
  'drdh',
  'pi',
  'matrix',
  'coc',
  'gurps',
  'shadowrun',
  'fae',
  'fate',
];

/**
 * Žánry — parita s FE `GENRES` (labely). Bez „Vlastní": nábor je katalogová
 * položka, custom žánr by se do filtru nikdy nechytil (spec 19.3 R15).
 */
export const NABOR_GENRES = [
  'Fantasy',
  'Dark Fantasy',
  'Sci-Fi',
  'Cyberpunk',
  'Steampunk',
  'Post-apokalypsa',
  'Horor',
  'Mystery',
  'Historický',
  'Současnost',
  'Western',
];
