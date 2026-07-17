/**
 * D-NEW-INV-DATA-SYNC — mapování token HP → per-system klíče v diary
 * `customData` postavy (PC/NPC). Klíče ověřeny proti FE combat panelům
 * (`system-panels/*CombatPanel.tsx`).
 *
 * ⚠️ NENÍ to zrcadlo FE `resolveCharacterHp.ts` — dřív to tu tak stálo, ale
 * FE mezitím doplnil i `shadowrun`, `fae`/`fate` a `drdplus`, které tady
 * chybí (viz seznam níže). Vztah je asymetrický: **FE ty systémy přečte, BE
 * je tudy zapsat neumí.** Nevadí to, protože žádný FE caller dnes pro ně
 * `patch.currentHp` u PC/NPC neposílá (jediný producent je `TokenSystemSheet`
 * pro `matrix`, který namapovaný je) — doplňovat je by znamenalo napsat mrtvý
 * kód a navíc rozhodnout herní sémantiku (viz níže). Až takový caller vznikne,
 * doplň mapování TEHDY.
 *
 * Architektura (memory `project_token_hp_architecture`): HP PC/NPC tokenu
 * žije v deníku postavy (`CharacterDiary.customData`), token samotný má
 * `currentHp/maxHp = 0`. Bestie token je nezávislá instance (HP v token
 * `systemStats` snapshotu) — bestie se tudy NIKDY nesyncují.
 *
 * Systémy BEZ mapování (→ `null`, sync se přeskočí) — „zdraví" tam není
 * jedno přímé číslo, zápis by nebyl jednoznačný:
 *  - `shadowrun` — bar = odvozenina (max = 8 + ⌈Tělo/2⌉, `sr_cond_phys`
 *    = zaplněné boxy); zápis by vyžadoval číst `sr_attr_bod` a přepočítávat.
 *  - `fae` / `fate` — stres = pole boxů `{on}` (který box zaškrtnout?).
 *  - `drdplus` — pásma zranění (`drdp_zraneni_mez/val`), bar = odvozenina.
 *  - `drd2` — 3 zdroje (Tělo/Duše/Vliv), žádné jedno HP.
 */

interface HpKeyMapping {
  /** Klíč pro aktuální HP. */
  current: string;
  /** Klíč pro max HP; `undefined` = max je v systému konstanta (nezapisuje se). */
  max?: string;
}

const HP_KEYS: Record<string, HpKeyMapping> = {
  // Max je konstanta 5 (MatrixCombatPanel) — zapisuje se jen current.
  matrix: { current: 'matrix_health' },
  // Příběhy Impéria — max konstanta 5.
  pi: { current: 'pi_health' },
  jad: { current: 'jad_hpCur', max: 'jad_hpMax' },
  dnd5e: { current: 'dnd_hpCur', max: 'dnd_hpMax' },
  coc: { current: 'coc_hp_cur', max: 'coc_hp_max' },
  gurps: { current: 'gurps_hp', max: 'gurps_hp_max' },
  drdh: { current: 'drdh_hp', max: 'drdh_hp_max' },
  // drd16 ukládá HP bez prefixu (legacy klíče).
  drd16: { current: 'hp_current', max: 'hp_max' },
};

/**
 * Sestaví delta patch pro `CharacterDiaryRepository.updateWithCustomDataPatch`
 * z mapového token patche. Vrací `null`, když systém nemá jednoznačné HP
 * mapování nebo patch nenese žádnou propsatelnou hodnotu.
 */
export function buildDiaryHpPatch(
  systemId: string,
  hp: { currentHp?: number; maxHp?: number },
): Record<string, unknown> | null {
  const mapping = HP_KEYS[systemId];
  if (!mapping) return null;
  const patch: Record<string, unknown> = {};
  if (hp.currentHp !== undefined && Number.isFinite(hp.currentHp)) {
    patch[mapping.current] = hp.currentHp;
  }
  if (hp.maxHp !== undefined && Number.isFinite(hp.maxHp) && mapping.max) {
    patch[mapping.max] = hp.maxHp;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
