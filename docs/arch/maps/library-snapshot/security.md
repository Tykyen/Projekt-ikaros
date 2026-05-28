# Bezpečnost

## Permission matrix per endpoint

| Endpoint | Role gate | Ownership gate |
|---|---|---|
| `GET /map-templates` | `JwtAuthGuard` | Auto-filter: PJ vidí jen `ownerId === self.id`, Admin/Superadmin vše |
| `GET /map-templates/:id` | `JwtAuthGuard` | `ownerId === self.id` OR Admin+ |
| `POST /map-templates` | `JwtAuthGuard` + role <= PJ | n/a (vytváří se s `ownerId: self.id`) |
| `PUT /map-templates/:id` | `JwtAuthGuard` + role <= PJ | `ownerId === self.id` OR Admin+; `ownerId` body field se **ignoruje** |
| `DELETE /map-templates/:id` | `JwtAuthGuard` + role <= PJ | `ownerId === self.id` OR Admin+ |

## `ownerId` immutability

`ownerId` se nastavuje **server-side** při `POST` na `user.id`. V `PUT` se `ownerId` z bodu **ignoruje** (zachováván z existujícího dokumentu). Důvod: zabránit "převzetí" cizí šablony přes vytvoření PUT s vlastním `ownerId`. (Nebylo by možné — guard zachytí — ale defense in depth.)

## Info leak — list filter

`GET /map-templates` musí vracet **JEN šablony patřící volajícímu** (pro non-Admin). Pokud by se filter dělal jen na klientovi, hráč/PJ by se mohl přihrát na endpoint a získat IDs cizích šablon (i když fetch detailu by selhal s 403). Server-side filter pokrývá oba scénáře.

## Admin/Superadmin — bypass scope

Admin a Superadmin **vidí a mohou modifikovat** všechny šablony. Důvody:

- Administrativní cleanup (smazat opuštěné šablony bývalého PJ).
- Migrace mezi PJ účty (Tyky rozdá své šablony specifickému PJ — nutí change `ownerId` direct v Mongo, nebo přes nový Admin endpoint? **TBD: zatím přes Mongo, žádný Admin endpoint v tomto specu**).

Konzistence s ostatními modely (User, Character, World) — Admin+ má univerzální bypass.

## Migrace existujících záznamů

**Source of truth** = `tykytanjunior@gmail.com` (Tyky = Superadmin per memory).

**Postup:**

1. Standalone skript běží jednou před nasazením new schemy.
2. Najde User dle emailu → `tykyId`.
3. UpdateMany na `mapTemplates` kde `ownerId` chybí → set `ownerId: tykyId`, `createdAt: now`, `updatedAt: now`.
4. Skript audituje: log počet upravených dokumentů.
5. Po migraci schema přejde na `ownerId: required`.

**Audit:** Po migraci runner ručně ověří v Mongo:
```js
db.mapTemplates.countDocuments({ ownerId: { $exists: false } })  // musí být 0
```

**Bezpečný default:** Tyky všechny zdědí; on rozhodne, komu rozeslat. Žádný PJ neztratí přístup ke své šabloně, pokud byla v knihovně (Tyky mu ji předá).

**Co když je `tykytanjunior@gmail.com` user nedostupný** (např. migrace v prázdné DB seed před vytvořením userů)? Skript se přeruší s chybou — neukládat fallback `ownerId: ''`, protože by porušil `required: true`.

## PC tokens — bezpečnostní filter

Server na save **musí** zfiltrovat PC tokeny z `tokens` pole. Helper `filterOutPcTokens(tokens) = tokens.filter(t => !!t.isNpc)`. Důvod:

- **Cross-world přenos** PC tokenu by leaknul `characterId` cizí postavy do šablony, která se může jednou aplikovat v jiném světě.
- I uvnitř stejného světa PC token v šabloně nedává smysl (hráč může být odlišný v okamžiku loadu).
- **Defense in depth:** klient (FE) už filtruje při save, ale i kdyby selhal, server zajistí integritu.

## WebSocket privacy

Load šablony aplikuje řadu per-scene ops. Každá broadcastuje `map:operation` na room `sceneId`. Jen klienti v té scéně to vidí. Žádný cross-scene leak.

**Šablona samotná** (samostatný dokument) — žádný WS broadcast při create/update/delete šablon. PJ knihovna se reloaduje přes manuální `invalidateQueries` v FE. Realtime sync šablon mezi PJ není potřeba — šablony jsou per-PJ private.
