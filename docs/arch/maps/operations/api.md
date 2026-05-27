# API

Všechny endpointy vyžadují `JwtAuthGuard` (Bearer token). Per-op autorizace je delegována na `assertCanDo(user, scene, op)` v service vrstvě.

---

## Apply Operation

**Metoda:** `POST`
**Cesta:** `/maps/:id/operations`

Aplikuje jednu operaci na scénu, persistuje do logu, broadcastne klientům.

### Vstup

```json
{
  "type": "token.move",
  "tokenId": "token-abc123",
  "q": 5,
  "r": -2
}
```

Discriminator field je `type`. Args závisí na typu — viz `data-models.md` `OperationPayload` katalog.

### Výstup (201 Created)

```json
{
  "seqNumber": 42,
  "appliedAt": "2026-05-27T14:32:08.421Z",
  "op": {
    "type": "token.move",
    "tokenId": "token-abc123",
    "q": 5,
    "r": -2
  },
  "inverse": {
    "type": "token.move",
    "tokenId": "token-abc123",
    "q": 3,
    "r": -1
  }
}
```

### WS side-effect

Po úspěšné aplikaci server emituje `map:operation` všem v `room=sceneId`:

```json
{
  "sceneId": "scene-xyz",
  "seqNumber": 42,
  "op": { "type": "token.move", "tokenId": "token-abc123", "q": 5, "r": -2 },
  "byUserId": "user-789",
  "appliedAt": "2026-05-27T14:32:08.421Z"
}
```

> Klienti aplikují op na lokální `scene` a updatují `lastSeqNumber`. **Nevidí `inverse` v broadcastu** — `inverse` je server-only metadata pro undo. (Pokud iniciátor potřebuje `inverse` pro undo stack, dostane ho v 201 response, ne v broadcastu.)

### Chybové stavy

| HTTP kód | Příčina |
|----------|---------|
| 400 | `MAP_OP_INVALID` — neznámý typ, chybné args, schema validace fail |
| 401 | Chybí / invalid JWT |
| 403 | `MAP_OP_FORBIDDEN` — uživatel nemá oprávnění na danou operaci |
| 404 | `MAP_SCENE_NOT_FOUND` — scéna neexistuje |
| 404 | `MAP_TOKEN_NOT_FOUND` / `MAP_EFFECT_NOT_FOUND` — cílový subdoc neexistuje |
| 409 | `MAP_OP_PRECONDITION_FAILED` — např. `combat.turn` při neaktivním boji |
| 429 | `MAP_OP_RATE_LIMITED` — viz `security.md` |

---

## Get Operations Since

**Metoda:** `GET`
**Cesta:** `/maps/:id/operations?since=<seqNumber>&limit=<n>`

Vrací ops s `seqNumber > since` v pořadí ascending. Pro reconnect catch-up.

### Query parametry

| Param | Typ | Povinné | Default | Popis |
|---|---|---|---|---|
| `since` | number | ne | 0 | Vrací ops s `seqNumber > since`. |
| `limit` | number | ne | 500 | Max počet ops. Hard cap server-side 1000. |

### Výstup (200 OK)

```json
{
  "sceneId": "scene-xyz",
  "lastSeqNumber": 87,
  "operations": [
    {
      "seqNumber": 43,
      "op": { "type": "token.move", "tokenId": "token-abc123", "q": 5, "r": -2 },
      "byUserId": "user-789",
      "appliedAt": "2026-05-27T14:32:08.421Z"
    },
    {
      "seqNumber": 44,
      "op": { "type": "fog.brush", "mode": "reveal", "hexes": [{"q":4,"r":-1},{"q":5,"r":-1}] },
      "byUserId": "user-789",
      "appliedAt": "2026-05-27T14:32:09.012Z"
    }
  ]
}
```

> Klient: pokud `lastSeqNumber > since + operations.length` (víc ops než limit dovolil), znovu zavolá s `since=last.seqNumber` až do konce. Pokud `lastSeqNumber === since + operations.length`, je up-to-date.

### Chybové stavy

| HTTP kód | Příčina |
|----------|---------|
| 401 | Chybí / invalid JWT |
| 403 | `MAP_FORBIDDEN` — user nemá read access (např. hráč jiného světa) |
| 404 | `MAP_SCENE_NOT_FOUND` |

### Read access (per `security.md`)

- **PJ + Admin + Sa** v daném světě → vidí všechny ops scény
- **Hráč** v daném světě → vidí všechny ops scény (potřebuje to k catch-up vlastního klienta)
  - **Read access je gated na `WorldMembership.currentSceneId === :id`** — hráč může číst jen log scény, na které právě je (per `WorldMembership.currentSceneId`). Pokud chce číst log jiné scény, vrátí 403. Privacy mezi scénami (boj v matrixu vs hospůdka).
  - Privacy past: ops obsahují `byUserId` — hráč může vidět, co ostatní udělali NA TÉ SAMÉ scéně. To je akceptovatelné (na mapě je každý akt veřejný).
- **User mimo svět** → 403

> ⚠️ **DIVERGENCE od §23.1 open question:** Původně se zvažovalo „hráč vidí jen své ops". V MVP **změna na „hráč vidí všechny ops scény, na které právě je"** — catch-up by jinak nefungoval. Inter-scene privacy je zajištěna gating přes `currentSceneId`.

---

## Apply World Operation (cross-scene)

**Metoda:** `POST`
**Cesta:** `/worlds/:worldId/operations`

Aplikuje cross-scene operaci (typicky `member.*`), persistuje do `worldOperations`, broadcastne klientům.

### Vstup

```json
{
  "type": "member.assignToScene",
  "userId": "user-matrixar",
  "sceneId": "scene-mapa2"
}
```

### Výstup (201 Created)

```json
{
  "seqNumber": 17,
  "appliedAt": "2026-05-27T14:35:12.103Z",
  "op": {
    "type": "member.assignToScene",
    "userId": "user-matrixar",
    "sceneId": "scene-mapa2"
  },
  "inverse": {
    "type": "member.assignToScene",
    "userId": "user-matrixar",
    "sceneId": "scene-mapa1"
  },
  "cascadeMapOpIds": ["507f1f77bcf86cd799439011"]
}
```

`cascadeMapOpIds` = ID `MapOperation` dokumentů, které server vyrobil jako side-effect (typicky `token.remove` na staré scéně). Klient je může později referencovat (např. pro orchestrator UI „kdy byl Matrixář naposled na scéně X").

### WS side-effects

Server emituje **4 paralelní eventy**:

1. **`map:operation`** na room `oldSceneId` (cascade token.remove) — všichni na staré scéně vidí, že Matrixářův token zmizel.
2. **`map:member-left`** na room `oldSceneId`:
   ```json
   { "sceneId": "scene-mapa1", "userId": "user-matrixar" }
   ```
3. **`map:member-joined`** na room `newSceneId`:
   ```json
   { "sceneId": "scene-mapa2", "userId": "user-matrixar", "characterName": "Matrixář" }
   ```
4. **`map:reassigned`** private emit affected hráčovu socketu (Matrixářovu):
   ```json
   { "newSceneId": "scene-mapa2" }
   ```
   Klient: leave room `scene-mapa1`, join `scene-mapa2`, autoload nové scény.
5. **`world:operation`** na room `world:{worldId}` (pro PJ orchestrator panel, který drží overview všech členů):
   ```json
   {
     "worldId": "world-foo",
     "seqNumber": 17,
     "op": { "type": "member.assignToScene", "userId": "user-matrixar", "sceneId": "scene-mapa2" },
     "byUserId": "user-pj",
     "appliedAt": "2026-05-27T14:35:12.103Z",
     "cascadeMapOpIds": ["507f1f77bcf86cd799439011"]
   }
   ```

### Chybové stavy

| HTTP kód | Příčina |
|----------|---------|
| 400 | `MAP_OP_INVALID` — neznámý typ, chybné args |
| 401 | Chybí / invalid JWT |
| 403 | `MAP_OP_FORBIDDEN` — non-PJ zkouší `member.*` |
| 404 | `MAP_SCENE_NOT_FOUND` — `sceneId` neexistuje ve světě |
| 404 | `MAP_MEMBER_NOT_FOUND` — `userId` není member daného světa |
| 409 | `MAP_OP_PRECONDITION_FAILED` — assigningToScene s `sceneId` jiného světa |
| 429 | `MAP_OP_RATE_LIMITED` |

---

## Get World Operations Since (catch-up cross-scene)

**Metoda:** `GET`
**Cesta:** `/worlds/:worldId/operations?since=<seqNumber>&limit=<n>`

Vrací cross-scene ops s `seqNumber > since`. Pro PJ orchestrator panel reconnect catch-up. Hráč obvykle nevolá (cross-scene info se ho dotýká jen přes `map:reassigned` private emit).

### Query parametry

| Param | Typ | Povinné | Default | Popis |
|---|---|---|---|---|
| `since` | number | ne | 0 | Vrací ops s `seqNumber > since`. |
| `limit` | number | ne | 200 | Max počet ops. Hard cap 500. |

### Výstup (200 OK)

```json
{
  "worldId": "world-foo",
  "lastSeqNumber": 17,
  "operations": [
    {
      "seqNumber": 17,
      "op": { "type": "member.assignToScene", "userId": "user-matrixar", "sceneId": "scene-mapa2" },
      "byUserId": "user-pj",
      "appliedAt": "2026-05-27T14:35:12.103Z",
      "cascadeMapOpIds": ["507f1f77bcf86cd799439011"]
    }
  ]
}
```

### Read access (per `security.md`)

- **PJ + Admin + Sa** ve světě → vidí všechny world ops (PJ orchestrator potřebuje overview)
- **Hráč** ve světě → **403** (privacy: hráč nepotřebuje vědět cross-scene rozmístění; dostává jen `map:reassigned` pro sebe)
- **User mimo svět** → 403

---

## Server-emit-only WS eventy

### `map:operation`

Emitovan při každém úspěšně aplikovaném `POST /maps/:id/operations` na room `sceneId`. Payload viz výše.

### `world:operation`

Emitovan při každém úspěšně aplikovaném `POST /worlds/:worldId/operations` na room `world:{worldId}`. Payload viz výše.

### `map:member-left`, `map:member-joined`, `map:reassigned`

Emitovany jako side-effect `member.*` ops. Detailně viz „WS side-effects" v Apply World Operation sekci výše.

### `map:operations-gap` / `world:operations-gap` (defer post-MVP)

Emitovan klientovi, který poslal `since` výrazně zastaralý (např. `since < lastSeqNumber - 1000`). Klient by měl udělat full `GET /maps/:id` resp. `GET /worlds/:id` refresh místo replay. Defer; v MVP klient sám detekuje pomocí check `operations.length === limit && hasMore`.

---

## Deprecated endpointy (zachovat krátce pro přechod)

Tyto endpointy ZŮSTÁVAJÍ v controlleru, ale jsou označené `@deprecated` v swagger metadata. Klient FE 10.2 je nepoužívá. Po stabilizaci 10.2 release → remove v dalším majoru.

| Endpoint | Náhrada |
|---|---|
| `PUT /maps/:id` | dekomponovat na řadu `scene.*` ops |
| `PATCH /maps/:id/move-token` | `POST /operations` s `token.move` |
| `PATCH /maps/:id/remove-token` | `POST /operations` s `token.remove` |

Zachovávané endpointy (NE deprecated):

- `GET /maps` (list scén ve světě; **rozšířeno o query `?isActive=true`** pro PJ orchestrator listing aktivních scén)
- `GET /maps/active?worldId=` — **per-user resolution** (viz níže)
- `GET /maps/:id` (s `enrichTokens`)
- `POST /maps` (create scene — to není mutace existující scény, je to creation)
- `POST /maps/:id/active` (flip flag, nově **bez deactivate sourozenců** — viz `data-models.md` § isActive uvolnění)
- `DELETE /maps/:id` (whole scene delete — ne ops)

### `GET /maps/active?worldId=` — per-user resolution

**Změna proti původnímu chování:** server vrací konkrétní scénu pro current user, ne „first active in world".

```
algorithm:
  1. lookup WorldMembership(userId, worldId)
     ├─ pokud membership.currentSceneId set → vrať scénu s tím ID
     │     (pokud scéna neexistuje / byla smazána → 404 MAP_NO_ACTIVE_SCENE)
     ├─ pokud null → 404 MAP_NO_ACTIVE_SCENE (klient zobrazí empty state „PJ ti ještě nepřiřadil scénu")
```

**PJ specifické chování:** PJ má v `currentSceneId` „svůj aktuální pohled" — vidí jednu scénu jako focused, ale v orchestrator panelu (10.2c) má list všech aktivních. PJ klient může jiným endpointem `GET /maps?worldId=&isActive=true` načíst všechny aktivní a přepínat mezi nimi (nastavuje `currentSceneId` pro vlastní user via `member.assignToScene` self-call).

**Otevřené:** Měla by `member.assignToScene` na sebe samotného být omezena (jen PJ může self-assign na jakoukoli scénu, hráč nemůže)? Doporučení MVP: **ano, jen PJ** — hráč se přesouvá výhradně skrz PJ orchestraci. Jediná hráčova svobodná akce = klik „odejít ze scény" = `member.unassign` self-call. **TBD v `security.md`.**

---

## Backwards compatibility WS

Stávající WS eventy (`map:token-moved`, `map:effect-added`, atd.) ZŮSTÁVAJÍ emitované **paralelně** s `map:operation` během přechodového období. Po stabilizaci 10.2 → remove.

Implementace v gateway: po insert `mapOperation`, emit `map:operation` + legacy mapping helper, který z op vytvoří starý formát.
