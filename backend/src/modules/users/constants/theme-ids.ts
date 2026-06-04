/**
 * N-11 — seznam platných theme ID pro validaci `themeId` v update-user DTO.
 *
 * ⚠️ CANONICAL ZDROJ je FE `src/themes/registry.ts` (`THEMES`). Toto je ruční
 * kopie pro BE validaci (`@IsIn`). Při PŘIDÁNÍ/ODEBRÁNÍ tématu na FE aktualizuj
 * i tento seznam — jinak BE odmítne nový validní motiv (400). Konzistentní se
 * vzorem „FE canonical → kopie do BE" (viz per-system schémata).
 */
export const THEME_IDS = [
  // Platformové vzhledy
  'modre-nebe',
  'zlaty-standard',
  'sci-fi',
  'bila',
  'vesmirna-lod',
  'priroda',
  'pergamen',
  'hospoda',
  'nemrtvi',
  'temna-cerven',
  'ctyri-zivly',
  'vesmirna-bitva',
  'severske-runy',
  'indiane',
  'africke',
  'arabsky-svet',
  'kyberpunk',
  'postapo',
  'magie',
  'mesic',
  'slunce',
  // Krok 5.7 — světové vzhledy
  'ikaros',
  'fantasy',
  'dark-fantasy',
  'vesmir',
  'cyberpunk',
  'steampunk',
  'apokalypsa',
  'horor',
  'mystery',
  'historie',
  'moderni',
  'western',
] as const;
