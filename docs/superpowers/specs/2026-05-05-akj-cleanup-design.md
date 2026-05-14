# AKJ cleanup — design

> Fáze 1.1 z [roadmap2.md](../../roadmap2.md). Původně formulováno jako „přidat `akj` claim do JWT" (parity se starým systémem). Po brainstormingu přepracováno na **cleanup**: AKJ je v novém systému per-world, globální `User.akj` flag a JWT claim ztrácejí smysl.

## Kontext

Starý systém (`docs/old/auth-jwt.md`, `docs/old/uzivatele.md:17`):
- `User.AKJ: int` — globální per-user, výchozí 0
- JWT claim `akj` z `User.AKJ.ToString()`
- Pages access: `user.AKJ >= req.value`

Nový systém (aktuální stav):
- `User.akj: boolean` — globální per-user (mrtvé pole)
- `WorldMembership.akj: number` — per-world hodnost (správný model)
- Pages access čte `membership.akj >= parseInt(req.value, 10)` (`backend/src/modules/pages/pages.service.ts:117, 123`)
- JWT claim `akj` neexistuje

**Rozhodnutí uživatele 2026-05-05:** AKJ je výhradně per-world. Globální `User.akj` ani JWT claim nedávají smysl.

## Cíl

1. Odstranit `User.akj` (mrtvé pole)
2. Odstranit admin endpoint `PATCH /admin/users/:id/akj` (no-op toggle)
3. Nepřidávat `akj` claim do JWT
4. `WorldMembership.akj: number` zachovat — to je správný model
5. Aktualizovat roadmap.md (krok 1, 4, 15) tak, aby přestala lhát

## Změny v kódu

### 1. Users modul — odstranění `akj`

| Soubor | Akce |
|---|---|
| `backend/src/modules/users/interfaces/user.interface.ts:27` | Odstranit `akj: boolean` |
| `backend/src/modules/users/schemas/user.schema.ts` | Odstranit `@Prop akj` |
| `backend/src/modules/users/users.repository.ts:81` | Odstranit `akj: (doc.akj as boolean) ?? false` z mapování |
| `backend/src/modules/users/dto/*` | Odstranit `akj` ze všech DTO, kde se vyskytuje |
| `backend/src/modules/users/users.service.ts` | Pokud někde merguje/přiřazuje `akj`, odstranit |

### 2. Admin modul — odstranění toggle endpointu

| Soubor | Akce |
|---|---|
| `backend/src/modules/admin/admin.controller.ts:56-63` | Odstranit `@Patch('users/:id/akj')` handler |
| `backend/src/modules/admin/admin.service.ts` | Odstranit `updateUserAkj()` metodu |
| `backend/src/modules/admin/dto/*` | Odstranit `UpdateUserAkjDto` (pokud existuje samostatně) |
| `backend/src/modules/admin/admin.service.spec.ts:57` | Odstranit relevantní test |
| `backend/src/modules/admin/admin.controller.spec.ts` | Odstranit relevantní test (pokud existuje) |

### 3. Auth modul — beze změny

JWT payload zůstává:
```ts
{ sub, email, username, role, characterPath, ikarosSkin }
```

Žádné `akj` se nepřidává. Tento bod je explicitní — chrání před budoucím omylem („přidat akj, parity"). Důvod je dokumentovaný v sekci „Vztah ke starému systému" níže.

### 4. WorldMembership — beze změny

`WorldMembership.akj: number` je správný model. Default 0. Update přes existující `PATCH /worlds/:worldId/members/:membershipId/akj` (v `worlds.controller.ts:201`).

### 5. Migrace dat (volitelná)

Pokud existují `User` dokumenty s polem `akj` v MongoDB, zůstanou tam jako neškodný garbage — Mongoose schema bez `akj` je při čtení ignoruje. Volitelný úklid:

```js
db.users.updateMany({}, { $unset: { akj: "" } })
```

Neblokuje funkčnost. Lze provést kdykoli později.

## Změny v dokumentaci

### `docs/roadmap.md`

- **Krok 1** — odstranit `akj` z výčtu JWT claims:
  - Před: „JWT claims: sub, unique_name, role, characterPath, ikarosSkin, **akj**"
  - Po: „JWT claims: sub, email, username, role, characterPath, ikarosSkin"
  - Audit poznámku přepsat: nezbývá `akj`, zbývá jen `POST /auth/refresh` (řešeno ve fázi 1.3)
- **Krok 4** — odstranit „AKJ flag: boolean na user schema; zahrnuto v JWT claims (akj)" → vysvětlit: AKJ je per-world, ne per-user
- **Krok 15** — odstranit `PATCH /api/admin/users/:id/akj` z výčtu Admin endpointů
- **Souhrnná tabulka** — zachovat ✅ pro Krok 1 (pokud po fázi 1.3 bude refresh hotový)

### `docs/roadmap2.md`

- **Fáze 1.1** přejmenovat: „akj v JWT" → „AKJ cleanup"
- Přepsat checklist dle skutečných změn v této speci
- **Otevřené otázky** — explicitní: „akj claim v JWT nebude nikdy přidán; AKJ je per-world model"

## Vztah ke starému systému

Toto je **vědomá odchylka od starého JWT kontraktu**. Důvody:

1. **Per-world model je bohatší** — hráč může mít v Matrixu jinou hodnost než v jiném světě. Globální AKJ to neumožňuje.
2. **Pages access logika** už per-world model implementuje (a má spec testy).
3. **JWT je globální token** — claim, který se používá per-world, do něj nepatří. Pokud by FE chtěl per-world AKJ, musí dotázat na `WorldMembership` daného světa.
4. **Žádný frontend zatím neexistuje** — porušení 1:1 parity se starým systémem nemá konzumenta.

## Test plán

**Co testy mají zachytit:**

1. `User.akj` odstraněn — pokud někdo v budoucnu doplní zpět, build neprojde (TypeScript chyba kvůli odstraněnému poli)
2. `PATCH /admin/users/:id/akj` vrací **404** (route neexistuje) — integration test, pokud existuje admin spec, jinak smoke test
3. `WorldMembership.akj` funguje dál:
   - Existující spec test v `pages.service.spec.ts:77, 84, 154-171` musí projít beze změny
   - `worlds.service` test pro `updateMemberAkj` (pokud existuje) musí projít

**Žádné nové testy** — jen jistota, že existující procházejí. Cleanup nemá novou funkčnost k testování.

## Riziko

- **Nízké.** Mrtvé pole se odstraňuje. Žádný consumer logiky neexistuje.
- Jediný drobný risk: pokud by někde existoval read `user.akj` (boolean) zapomenutý mimo admin → grep ukázal jen 3 výskyty, všechny v admin path. Po cleanup grep `user\.akj|\.akj.*boolean` musí vrátit 0.

## Rollback

Pokud by se ukázalo, že User.akj je potřeba pro neidentifikovaný use case:
1. `git revert` cleanup commit
2. Diskuse, k čemu pole má sloužit
3. Nový design s konkrétním use case

## Hotovo když

- [ ] `grep -r "user\.akj\|akj: boolean" backend/src` = 0 matches (kromě případně `dto`/`schema` pro `WorldMembership`)
- [ ] `npm test` v `backend/` projde
- [ ] `npm run build` projde
- [ ] roadmap.md upraven dle sekce „Změny v dokumentaci"
- [ ] roadmap2.md fáze 1.1 přejmenována a přepsána
