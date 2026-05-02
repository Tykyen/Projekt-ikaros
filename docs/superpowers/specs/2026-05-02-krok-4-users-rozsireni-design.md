# Krok 4 — Users rozšíření: Design Spec

**Datum:** 2026-05-02  
**Stav:** Schváleno  
**Závisí na:** Krok 1 (Auth + Users základ), Krok 2 (Worlds + WorldMembership)

---

## Cíl

Dokončit User model o globální preference a bezpečnostní funkce. Vše co se týká per-světových dat (FavoritePages, PopulateProfileImages) patří do Kroku 6 — zde řešíme jen věci bez závislosti na Pages modulu.

---

## Co přidáváme

### 1. Schema rozšíření

Tři nová pole na `UserSchemaClass`:

| Pole | Typ | Default | Popis |
|------|-----|---------|-------|
| `akj` | `boolean` | `false` | Hráč má aktuální kartu Jacku |
| `themeSettings` | `Object` | `{}` | Volný JSON blob — UI téma, barvy, velikost písma |
| `chatPreferences` | `Object` | `{}` | Volný JSON blob — font, compactMode, notifikace |

**Proč volný objekt pro themeSettings a chatPreferences:** Nikdy se podle nich nevyhledává, jen se načítají a ukládají. Pevná struktura by vyžadovala backend migraci při každé frontend změně.

**isOnline se neodstraňuje** ze schematu (existuje, není breaking change), ale **přestane se aktivně nastavovat** — Krok 5 (Presence) definuje "online" z `lastSeenAt` threshold. `updateLastSeen` nadále aktualizuje jen `lastSeenAt`.

---

### 2. JWT claims rozšíření

Přibude claim `akj: boolean`. Výsledný payload:

```
sub          → userId
email        → user.email
username     → user.username
role         → user.role (číslo)
characterPath → user.characterPath ?? ''
ikarosSkin   → user.ikarosSkin ?? 'default'
akj          → user.akj ?? false      ← NOVÉ
```

`characterPath` a `ikarosSkin` v JWT jsou globální výchozí hodnoty. Per-světové ekvivalenty žijí v `WorldMembership` a frontend si je dotáhne zvlášť.

---

### 3. JwtAuthGuard — lastSeenAt update

`JwtAuthGuard` dostane injektovaný `IUsersRepository`. Override metody `canActivate`:

1. Zavolá `super.canActivate(context)` — JWT validace
2. Pokud selže → vyhodí výjimku (beze změny)
3. Pokud projde → vytáhne `userId` z `request.user.sub`
4. Zavolá `this.usersRepo.updateLastSeen(userId)` **bez await** (fire-and-forget)
5. Vrátí `true`

Fire-and-forget znamená: chyba v `updateLastSeen` neovlivní response. Loguje se jako warning, nepadá request.

`updateLastSeen` nadále nastavuje pouze `lastSeenAt: new Date()` — **isOnline se zde nenastavuje.**

---

### 4. UpdateUserDto rozšíření

Přibydou dvě volitelná pole:

```typescript
themeSettings?: Record<string, unknown>
chatPreferences?: Record<string, unknown>
```

Bez validace obsahu — backend přijme cokoliv frontend pošle.

---

### 5. PATCH merge logika

V `UsersService.update()`:

- `themeSettings`: **deep merge** — `{ ...existingUser.themeSettings, ...dto.themeSettings }` — pokud dto.themeSettings je `null` nebo `undefined`, zachovej stávající hodnotu (žádný spread)
- `chatPreferences`: stejné pravidlo jako themeSettings
- Ostatní pole (`displayName`, `avatarUrl`, `characterPath`, `ikarosSkin`): přímé přepsání, jen pokud hodnota v dto není `undefined`

Deep merge umožňuje frontend poslat jen změněné klíče (`{ accentColor: 'red' }`) bez nutnosti posílat celý objekt. `null` se chová jako "nic neposlal" — nikdy nevymaže celý blob.

---

### 6. Endpointy

#### Existující (beze změny chování, rozšíření dto)
- `GET /api/users/me` — vlastní profil (full data bez passwordHash)
- `GET /api/users/:id` — vlastní nebo Admin+
- `PATCH /api/users/:id` — rozšířen o themeSettings, chatPreferences

#### Nové
- `GET /api/users/profile/:id` — veřejný profil, **bez autentizace**
- `PUT /api/users/password` — změna hesla, vyžaduje JWT
- `DELETE /api/users/:id` — vlastní účet nebo Admin+

---

### 7. PublicProfile

Veřejný subset User dat — bez citlivých polí:

```typescript
interface PublicUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  createdAt: Date;
}
```

Vynechává: `email`, `passwordHash`, `themeSettings`, `chatPreferences`, `akj`, `lastSeenAt`, `isOnline`, `ikarosSkin`.

Endpoint je **bez autentizace** — slouží pro zobrazení autorů zpráv, kartiček uživatelů apod.

---

### 8. ChangePassword

`PUT /api/users/password` — pouze vlastní heslo. Controller ověří `requester.id === params.id` — Admin nemůže měnit cizí heslo tímto endpointem (pro admin reset slouží budoucí admin endpoint v Kroku 15).

```typescript
class ChangePasswordDto {
  oldPassword: string   // min 1
  newPassword: string   // min 8, max 128
}
```

Logika:
1. Načti uživatele z DB (s passwordHash)
2. `bcrypt.compare(oldPassword, user.passwordHash)` — pokud selže → `UnauthorizedException`
3. `bcrypt.hash(newPassword, 10)` → ulož

---

### 9. DELETE /api/users/:id

- Vlastní účet: může kdokoliv smazat svůj účet
- Cizí účet: jen Admin nebo vyšší role
- Vrací `204 No Content`
- Nesmaže přidružená data (WorldMembership, zprávy) — to řeší Krok 16 (Finalizace)

---

## Co se nemění

- `UserRole` enum (9 rolí) — beze změny
- Auth flow (login, register, JWT generování) — jen přidání `akj` do payloadu
- `findById`, `findByEmail`, `findByUsername`, `findFirstByRole` — beze změny
- Repository `toEntity` — rozšíří se o nová pole

---

## Testování

### JwtAuthGuard
- `updateLastSeen` se zavolá po úspěšném JWT
- `updateLastSeen` se **nezavolá** po neplatném JWT
- Chyba v `updateLastSeen` neovlivní výsledek requestu (fire-and-forget)

### UsersService
- PATCH deep-merge: `{ theme: 'dark' }` + `{ fontSize: 14 }` → výsledek obsahuje obě hodnoty
- PATCH deep-merge: `{ theme: 'dark' }` přepíše `{ theme: 'light' }` ale zachová ostatní klíče
- ChangePassword: správné staré heslo → úspěch
- ChangePassword: špatné staré heslo → `UnauthorizedException`
- PublicProfile neobsahuje `email`, `passwordHash`, `themeSettings`

### UsersController
- `GET /profile/:id` přístupný bez JWT
- `DELETE /:id` cizího účtu non-adminem → `ForbiddenException`
- `PUT /password` jiného userId než vlastního → `ForbiddenException`

---

## Soubory ke změně / vytvoření

```
backend/src/modules/users/
├── schemas/user.schema.ts              ← přidat akj, themeSettings, chatPreferences; isOnline ponechat
├── interfaces/user.interface.ts        ← přidat akj, themeSettings, chatPreferences do User interface
├── interfaces/users-repository.interface.ts ← updateLastSeen zůstává beze změny
├── users.repository.ts                 ← toEntity rozšíření o nová pole
├── dto/update-user.dto.ts              ← přidat themeSettings, chatPreferences
├── dto/change-password.dto.ts          ← NOVÉ
├── users.service.ts                    ← update merge logika, changePassword, publicProfile
├── users.service.spec.ts               ← NOVÉ / rozšíření testů
├── users.controller.ts                 ← nové endpointy

backend/src/common/guards/
└── jwt-auth.guard.ts                   ← inject IUsersRepository, fire-and-forget updateLastSeen

backend/src/modules/auth/
└── auth.service.ts                     ← přidat akj do JWT payload
```
