# 16.2d-mapa — DrD+ na taktické mapě (combat + bestie panel) — HANDOFF

Status: 🚧 plánováno (handoff pro novou konverzaci)
Navazuje: [16.2d deník DrD+](spec-16.2d-denik-drdplus.md) (HOTOVO) · vzor [16.2b-mapa drd16](spec-16.2b-mapa-drd16.md)

> **Účel dokumentu:** zadání pro novou konverzaci. DrD+ deník (CharacterDetail/chat) je hotový; teď chybí jeho protějšek na **taktické mapě** — kompaktní bojový panel pro token (PC/NPC) a pro bestii. Replikuje se vzor, který už má **drd16** (16.2b-mapa) a **matrix** (16.2a).

---

## 1. Co je HOTOVO (16.2d deník) — na čem stavět

DrD+ deník = jeden pergamenový list, výběr povolání erbem. Soubory (`sheets/drdplus/` ve FE):
- `DrdPlusSheet.tsx` — kostra + strany + erb
- `DrdPlusShared.tsx` — **`Scale`, `Tri`, `WoundGrid`, `SignedScale`, `PrincipHex`, `JsonTable`** (znovupoužitelné i v combat panelu!)
- `DrdPlusCards.tsx` — kouzla/formule/démoni
- `DrdPlusProfessions.tsx` — 6 povolání
- `constants.ts` — povolání (glyph, pointsKey), staty, projevy, principy…
- `styles/drdplus.css` — pergamen, scoped `.dp-sheet`, tokeny `--dp-*`, akcent per `[data-prof]`

Data: `customData` prefix **`drdp_`** přes `makeCdAccess(cd, 'drdp_', onChange)` (delta-merge). BE = **pass-through** (žádné schéma pro drdplus → klíče se neuloží přes whitelist, viz ověření v deníku). Mockup vizuálu: `scratchpad/drdplus-denik-navrh.html`.

💡 **Combat panel může reusovat `WoundGrid` (lišta zranění/únava), `Scale`/`Tri` a `drdp_` klíče deníku** — stejně jako drd16 panel reusuje drd16 sheet logiku.

---

## 2. Cíl této featury

Token na taktické mapě pro svět se systémem `drdplus` má dnes **fallback** (PC→DiaryTab plný list, Bestie→generic `BestiePanelView`). Cíl = dedikované kompaktní panely:

1. **`DrdPlusCombatPanel`** (PC/NPC) — bojové minimum: zranění (lišta/mez), Boj/Útok/Střelba/Obrana s klik=hod, kombinace zbraní, schopnosti per povolání. Data z `diary.customData` (`drdp_*`) přes `token.characterSlug`.
2. **`DrdPlusBestiePanel`** (bestie) — HP/zranění, útoky, OČ, iniciativa; data z `token.systemStats` (snapshot).
3. **Token schéma** `drdplus/bestie.json` + `drdplus/token.json` (jinak `generic:token` → 400 při editu systemStats).
4. **Dice `2k6+`** — DrD+ otevřený hod: 2× d6, každá **6 exploduje** (přehazuje a přičítá). Hod na boj = BČ+2k6+, útok = ÚČ+2k6+, obrana = OČ+2k6+, zranění = ZZ+1k6.

---

## 3. Checklist (z mapování kódu)

| # | Položka | Status | Cesta / vzor |
|---|---------|--------|--------------|
| 1 | Combat panel (PC/NPC) | ❌ TODO | `tactical-map/components/token-panel/system-panels/DrdPlusCombatPanel.tsx` |
| 2 | Bestie panel | ❌ TODO | `system-panels/DrdPlusBestiePanel.tsx` |
| 3 | Registr combat panelů | ❌ přidat řádek | `token-panel/combatPanels.ts` → `drdplus: DrdPlusCombatPanel` |
| 4 | Routing bestie panelu | ❌ přidat větev | `TokenSystemSheet.tsx` (`if system==='drdplus' → DrdPlusBestiePanel`) |
| 5 | Schéma `drdplus/bestie.json` + `token.json` | ❌ TODO | `tactical-map/schemas/drdplus/` (vzor `schemas/drd16/`) |
| 6 | Bootstrap registrace schémat | ❌ přidat | `tactical-map/schemas/bootstrap.ts` (`drdplusSchemas`) |
| 7 | Export schémat do BE | ❌ spustit | `npm run export-schemas` (po vytvoření JSON) |
| 8 | Dice kind `2k6+` (přesný algoritmus v **§6b**) | ❌ TODO | `chat/dice/lib/rollEngine.ts` (nová roll fce vedle `rollExplodingD6`) + union `RollKind` **i** `DiaryRollKind` (`rollFromDiary.ts`) + `rollFromSheet.ts` |
| 8b | Per-systém doporučená kostka (drd16→`d6+`, drdplus→`2k6+`) v dice rolleru | ❌ TODO | dice roller UI (chat) — default/zvýraznění dle `world.system` |
| 9 | `buildSpawnToken` HP seed pro drdplus | ⚠️ ověřit | schema-aware `combatBehavior:'damageable'` klíč; DrD+ HP = mez zranění, ne `health.max` |

---

## 4. Klíčové soubory k přečtení (vzory)

- **Registr panelů:** `tactical-map/components/token-panel/combatPanels.ts` (mapuje `world.system` → panel; drd16/matrix registrované)
- **Routing:** `tactical-map/components/token-panel/TokenSystemSheet.tsx` (bestie vs PC/NPC větvení; fallback DiaryTab / BestiePanelView)
- **Vzor PC panel:** `system-panels/Drd16CombatPanel.tsx` — props `{ token, sceneId, worldId, canEdit, onRoll }`; PC čte `useCharacterDiary(worldId, token.characterSlug)` + `useUpdateCharacterDiary` (debounce 500 ms); klik=hod přes `onRoll({label, modifier, kind})`
- **Vzor bestie panel:** `system-panels/Drd16BestiePanel.tsx` + `Drd16BestieCombatActions.tsx` (sdílené jádro mapa↔chat); bestie čte `token.systemStats`, HP přes `useTokenUpdate` (`token.currentHp`)
- **Token build:** `tactical-map/utils/buildSpawnToken.ts` (HP seed schema-aware), `rollFromSheet.ts` (`performSheetRoll`, `kind==='d6+' ? rollExplodingD6() : rollGenericDice`)
- **Schémata:** `tactical-map/schemas/{registry.ts,bootstrap.ts,drd16/}` (vzor JSON), BE sync `backend/assets/schemas/` přes `npm run export-schemas`
- **Dice:** `chat/dice/lib/rollEngine.ts` (`RollKind` union, `rollExplodingD6`, `rollPool`), `rollFromDiary.ts` (`DiaryRollKind` — držet in sync!)
- **Bestie generic fallback:** `token-panel/BestiePanelView.tsx` (schema-driven `BestieStatblock`)

---

## 5. Data model (PC vs Bestie)

- **PC/NPC** = deník-backed: token má `characterSlug` → `diary.customData` (`drdp_*`), sdílený editor s deníkem. Token nenese `systemStats`.
- **Bestie** = token instance: `token.systemStats` = snapshot ze šablony (immutable ref `templateId`), edit izolovaný. HP přes `token.currentHp/maxHp/injury`. Schema-aware HP klíč dle `combatBehavior:'damageable'` v `<system>:bestie` schématu.

---

## 6. DrD+ bojová mechanika (z PDF strana 2 — k dořešení s uživatelem)

- **Hodnoty:** Boj (BČ = Boj + délka zbraně), Útok (ÚČ = Útok + útočnost zbraně), Střelba, Obrana (OČ + kryt). Zranění ZZ = Síla ⊕ zranění zbraně.
- **Hody:** Hod na boj = BČ + 2k6+; útok = ÚČ + 2k6+; obrana = OČ + 2k6+; zranění = ZZ + 1k6.
- **Zdraví:** lišta zranění (řádky Bez postihu/Postih/Bezvědomí/Smrt, mez = políček/řádek) — viz `WoundGrid` v deníku. Na mapě = aktuální zranění vs mez (HP-like).
- **Iniciativa:** DrD+ nemá d20 iniciativu; zvážit Rychlost nebo „hod na boj". **OTEVŘENÁ OTÁZKA pro uživatele.**

---

## 6b. Kostky — doporučené per systém (PŘESNÁ pravidla od uživatele, NErekonstruovat z paměti)

Dice roller (chat / sheet roll) má pro daný systém **doporučit / defaultovat** systémovou kostku:
- **drd16 → `d6+`** (už existuje, `rollExplodingD6`): exploding d6 — každá **6** se přehazuje a hody se **sčítají**.
- **drdplus → `2k6+`** (`2d6+`, nové): otevřený hod oběma směry, jen na extrémech. **Výsledek může být i záporný.**

### Algoritmus `2k6+` (2× d6, otevření jen při 2×6 nebo 2×1)
```
a = d6; b = d6;            // dvě základní kostky
total = a + b;
if (a === 6 && b === 6) {  // dvě šestky → otevření NAHORU
  // házej 1 kostkou: 4/5/6 → +1 a pokračuj; 1/2/3 → STOP
  while (true) { c = d6; if (c >= 4) total += 1; else break; }
} else if (a === 1 && b === 1) {  // dvě jedničky → otevření DOLŮ
  // házej 1 kostkou: 1/2/3 → −1 a pokračuj; 4/5/6 → STOP
  while (true) { c = d6; if (c <= 3) total -= 1; else break; }
}
// jinak žádné otevření: total = a + b
// (bezpečnostní cap iterací jako u d6+ = 50)
```

**Příklad NAHORU:** `2×6`, pak `4, 6, 1` → 6+6, +1 (za 4), +1 (za 6), pak **1 zastaví** → `(6+6) +1 +1 = 14`.
**Příklad DOLŮ:** `2×1`, pak `1, 3, 1, 2, 3, 5` → 1+1, pětkrát −1 (za 1/3/1/2/3), pak **5 zastaví** → `(1+1) −1×5 = −3`.

Breakdown pro UI: základ `(a+b)` + série `±1` + součet (např. `(6+6) +1 +1 = 14`).

⚠️ **`2k6+` ≠ drd16 `d6+`.** d6+ exploduje sčítáním plné hodnoty kostky na každé 6; 2k6+ otevírá jen na 2×6 / 2×1 a krokuje po ±1 (a může jít do záporu). Nepleť algoritmy.

---

## 7. Pasti (z chybového deníku — NEopakovat)

- **`drdplus:token` schéma MUSÍ existovat** než se edituje `token.systemStats`, jinak BE strict validace `generic:token` → **400 Unknown field** (CH z 16.2b: drd16 to potřeboval). Vytvořit `token.json` se stejnými poli jako `bestie.json`.
- **`2k6+` je dual-source union na víc místech** — `RollKind` (rollEngine), `DiaryRollKind` (rollFromDiary), `rollFromSheet` switch. Drift chytí až `tsc -b` / runtime fallback na d20. Přidat kind do VŠECH.
- **Namespace tokenů self-contained** — combat panel CSS NEdědit slepě `--mx-*` (matrix) ani `--dd-*` (drd16); DrD+ má `--dp-*` (pergamen). Reuse `.dp-*` tříd z `drdplus.css` (zvážit, zda panel = scoped `.dp-sheet` mini, nebo vlastní `--dp-*` blok).
- **`cd` v Bash loopu mění sdílený cwd** (CH-014, 3×) — build/test pak běží jinde. Iteruj absolutními cestami.
- **FE testy:** `npm run test:run -- <path>`, ne `npx vitest` (CH-029).
- **Agentní report = hypotéza** — verifikuj čtením (např. „BE nutná" u deníku byla mylná).

---

## 8. Postup pro novou konverzaci

1. Přečíst tento dokument + `spec-16.2b-mapa-drd16.md` + vzorové panely (`Drd16CombatPanel/BestiePanel`).
2. **Doladit s uživatelem DrD+ bojovou mechaniku na mapě** (iniciativa, co přesně do kompaktního panelu, 2k6+ chování) — `spec-driven-development` → souhlas.
3. Schémata `drdplus/bestie.json` + `token.json` → bootstrap → `export-schemas`.
4. Dice `2k6+` (exploding 2d6) do všech unionů + roll funkce.
5. `DrdPlusCombatPanel` + `DrdPlusBestiePanel` (reuse `WoundGrid`/`Scale`/`Tri` + `drdp_` klíče) → registr + routing.
6. `mobil-desktop`, testy (`npm run test:run`), `tsc -b`, eslint, `funkce`/`napoveda`.

## Reference
- Memory: [[project_takticka_mapa_multi_system]], [[project_token_hp_architecture]], [[project_bestie_token_instance]], [[project_map_token_tomapper_whitelist]], [[project_token_modal_variants]], [[project_drd16_system_status]]
- Mockup deníku (vizuál): `scratchpad/drdplus-denik-navrh.html`
