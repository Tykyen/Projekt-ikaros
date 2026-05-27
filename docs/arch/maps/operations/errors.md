# Chybové stavy

Všechny chyby vrací standardní NestJS error structure:

```json
{
  "statusCode": 4xx,
  "code": "MAP_OP_*",
  "message": "<lokalizovaná zpráva>"
}
```

---

## MAP_OP_INVALID

**Kód:** `MAP_OP_INVALID`
**HTTP status:** 400

**Příčina:** Request body neprojde validací — neznámý `op.type`, chybějící povinné args, špatný typ argu (např. `q` není number), neplatná hex coord, neznámé enum hodnoty (např. `fog.brush.mode = 'xxx'`).

**Handling:** Server odpoví bez side-effects. **NEpřičítá `seqNumber`** (counter zůstane). Klient by měl zobrazit „Neplatná operace" + log do konzole; nedoporučuje se retry beze změny.

---

## MAP_OP_FORBIDDEN

**Kód:** `MAP_OP_FORBIDDEN`
**HTTP status:** 403

**Příčina:** `assertCanDo(user, scene, op)` vrátil false. Příklady:

- Hráč zkouší `effect.add` (PJ-only)
- Hráč zkouší `token.move` cizího tokenu (ne svého)
- Hráč mimo svět zkouší jakoukoli operaci ve scéně světa
- Hráč zkouší `scene.state` (PJ-only)

**Handling:** Server odpoví bez side-effects, **NEpřičítá `seqNumber`**. Klient: log + UI feedback (toast „Nemáš oprávnění"). Útok detekce: log s `userId` + `op.type` + `sceneId` na audit channel.

---

## MAP_SCENE_NOT_FOUND

**Kód:** `MAP_SCENE_NOT_FOUND`
**HTTP status:** 404

**Příčina:** `:id` v cestě neodpovídá žádné scéně v `mapScenes`.

**Handling:** Server odpoví bez side-effects. Klient: pravděpodobně stale link / zaniklá scéna → navigate na `/maps` list.

---

## MAP_TOKEN_NOT_FOUND

**Kód:** `MAP_TOKEN_NOT_FOUND`
**HTTP status:** 404

**Příčina:** Operace referencuje `tokenId`, který ve `scene.tokens` neexistuje (např. `token.move` na token, který mezitím někdo smazal).

**Handling:** Server odpoví bez side-effects. Klient: pravděpodobně lokální stale state → trigger catch-up `GET /maps/:id/operations?since=lastSeq`.

> 💡 Race scenario: PJ smaže token v t1, hráč v t2 zkouší pohnout. Server v t2 detekuje absent token a vrátí 404. Klient catch-up dohoní `token.remove` event a UI se vyrovná.

---

## MAP_EFFECT_NOT_FOUND

**Kód:** `MAP_EFFECT_NOT_FOUND`
**HTTP status:** 404

**Příčina:** Operace referencuje `effectId`, který ve `scene.effects` neexistuje (`effect.update`, `effect.remove`).

**Handling:** Jako `MAP_TOKEN_NOT_FOUND`.

---

## MAP_NPC_TEMPLATE_NOT_FOUND

**Kód:** `MAP_NPC_TEMPLATE_NOT_FOUND`
**HTTP status:** 404

**Příčina:** Operace `npcTemplate.update` / `.remove` referencuje neznámý `templateId`.

**Handling:** Jako `MAP_TOKEN_NOT_FOUND`.

---

## MAP_OP_PRECONDITION_FAILED

**Kód:** `MAP_OP_PRECONDITION_FAILED`
**HTTP status:** 409

**Příčina:** Operace vyžaduje určitý state, který scéna nemá. Příklady:

- `combat.turn` bez aktivního combat (`scene.combat?.isActive !== true`)
- `combat.start` při už aktivním combat (`scene.combat?.isActive === true`) — vyžaduje předchozí `combat.end`
- `combat.effect.add` s `tokenId`, který není v `combat.order`
- `scene.image` s `imageUrl`, který je už aktuální (no-op detection — volitelné, doporučeno NE-impl, klient si to ohlídá)

**Handling:** Server odpoví bez side-effects. Klient: log + UI feedback („Nelze provést — boj není aktivní"); nedoporučuje se retry.

---

## MAP_OP_SEQ_CONFLICT

**Kód:** `MAP_OP_SEQ_CONFLICT`
**HTTP status:** 500

**Příčina:** Atomic increment `MapScene.lastSeqNumber` selhal (Mongo unreachable, scéna paralelně smazána mezi increment a log insert).

**Handling:** Server log s context. Klient: retry s exponential backoff (3 pokusy, delays 500/1500/4000 ms), pak ohlásit jako fatal.

> Tohle je vzácná chyba (Mongo failure mode); většinou znamená infra problém, ne race condition.

---

## MAP_OP_RATE_LIMITED

**Kód:** `MAP_OP_RATE_LIMITED`
**HTTP status:** 429

**Příčina:** User překročil per-user rate limit (viz `security.md`).

**Handling:** Response header `Retry-After: <seconds>`. Klient: queue + retry po delay, NEpopnout op ze stacku.

---

## MAP_FORBIDDEN (GET /operations)

**Kód:** `MAP_FORBIDDEN`
**HTTP status:** 403

**Příčina:** User chce číst log scény ve světě, ve kterém není member, **NEBO hráč chce číst log scény, na které není aktuálně přiřazený** (`WorldMembership.currentSceneId !== :id`).

**Handling:** Server log; klient UI „Nemáš přístup".

---

## MAP_MEMBER_NOT_FOUND

**Kód:** `MAP_MEMBER_NOT_FOUND`
**HTTP status:** 404

**Příčina:** `member.assignToScene` / `member.unassign` referencuje `userId`, který není member daného světa (chybí `WorldMembership` doc).

**Handling:** Server log. Klient (PJ orchestrator UI): refresh členů světa, repaint dropdownu.

---

## MAP_MEMBER_NOT_IN_WORLD

**Kód:** `MAP_MEMBER_NOT_IN_WORLD`
**HTTP status:** 409

**Příčina:** Cross-scene op `member.assignToScene` přiřazuje hráče na `sceneId`, jejíž `worldId` neodpovídá worldu, ve kterém je hráč member.

**Handling:** Server log. Klient: pravděpodobně bug (UI nemělo nabízet scénu mimo svět); reportovat.

---

## WORLD_OP_INVALID / WORLD_OP_FORBIDDEN / WORLD_OP_PRECONDITION_FAILED

**HTTP status:** 400 / 403 / 409

**Příčina:** Stejná sémantika jako `MAP_OP_*` ekvivalenty, ale pro cross-scene ops na endpointu `POST /worlds/:worldId/operations`. Kódy se liší prefixem pro snadnou identifikaci scope.

**Handling:** Stejný jako MAP_OP variants.

---

## Validace per op typ

Specifické validační chyby per `op.type` všechny spadají pod `MAP_OP_INVALID` se zprávou indikující detail. Příklady:

| Op | Validační pravidlo |
|---|---|
| `token.move` | `q` a `r` musí být integer; `tokenId` neprázdný |
| `token.add` | `token.id` unikátní v scene.tokens; `token.q/r` integer |
| `effect.add` | `effect.type` ∈ {`color`, `barrier`, `explosion`}; `effect.hexes` non-empty |
| `fog.brush` | `mode` ∈ {`reveal`, `fog`}; `hexes` non-empty array |
| `combat.start` | `orderTokenIds` non-empty; všechny IDs existují v scene.tokens |
| `combat.turn` (with tokenId) | `tokenId` musí být v `combat.order` |
| `npcTemplate.update` | `patch` musí mít aspoň 1 pole |
