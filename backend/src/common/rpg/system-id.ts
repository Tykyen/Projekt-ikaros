/**
 * Sjednocená normalizace `world.system` na canonical engine id (BE strana).
 *
 * ⚠️ **DUAL SOURCE — stejná past jako THEME_IDS / NABOR_SYSTEM_IDS.** Zdroj
 * pravdy je FE `src/features/world/systemId.ts` (`SYSTEM_ALIASES` +
 * `resolveSystemId`). Tohle je jeho BE zrcadlo — **měníš alias? změň OBĚ místa.**
 *
 * Proč BE potřebuje kopii (DUN-1): nabídka tvorby světa ukládá do `world.system`
 * „dlouhá" id (`drd-plus`, `call-of-cthulhu`, `draci-hlidka`), zatímco schémata
 * (a engine) je znají „krátce" (`drdplus`, `coc`, `drdh`). Bez normalizace
 * `SchemaRegistryService.get('drd-plus','token')` vrací `null` → validace
 * `systemStats` se pro alias-systémy **tiše přeskočí** (soft-mode `_schema`).
 * Normalizace v BE lookupu sladí, KTERÉ schéma platí, s FE resolucí.
 */

/** Legacy / „dlouhá" id z nabídky → canonical engine id. Parita s FE. */
export const SYSTEM_ALIASES: Record<string, string> = {
  // legacy DnD id
  dnd: 'dnd5e',
  // legacy Příběhy Impéria hodnoty z `world.system`
  pribehy: 'pi',
  pribehy_imperia: 'pi',
  'pribehy-imperia': 'pi',
  // nabídka (RPG_SYSTEMS) ukládá „dlouhá" id, engine zná krátká
  'draci-hlidka': 'drdh',
  'drd-plus': 'drdplus',
  'call-of-cthulhu': 'coc',
  // „Vlastní Systém" běží na generic schema-driven engine
  vlastni: 'generic',
};

/**
 * Normalizuje `world.system` na canonical engine id (lowercase + alias).
 * Prázdné / null / undefined → `''` (volající fallbackuje). Neznámé id se
 * vrací beze změny (jen lowercased) — volající rozhodne.
 */
export function resolveSystemId(systemId: string | null | undefined): string {
  if (!systemId) return '';
  const normalized = systemId.toLowerCase();
  return SYSTEM_ALIASES[normalized] ?? normalized;
}
