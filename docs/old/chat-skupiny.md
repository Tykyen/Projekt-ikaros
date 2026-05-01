# Chat skupiny — dokumentace

Platí pro: `matrixBackend` (ASP.NET Core 8, MongoDB)

---

## Model ChatGroup

MongoDB kolekce: `chatGroups`

| Pole         | Typ      | Povinné | Popis                                                                |
|--------------|----------|---------|----------------------------------------------------------------------|
| `Id`         | ObjectId | auto    | MongoDB ID                                                           |
| `WorldId`    | string?  | ne      | Null = Matrix skupina; ObjectId = skupina patří světu                |
| `Name`       | string   | ano     | Název skupiny (zobrazuje se v sidebaru)                              |
| `Icon`       | string?  | ne      | Ikona (URL nebo emoji)                                               |
| `Background` | string?  | ne      | CSS barva/URL pozadí hlavičky skupiny                                |
| `Color`      | string?  | ne      | Barva textu/zvýraznění (#hex)                                        |
| `Order`      | int      | ne      | Pořadí v sidebaru, výchozí 0; řazení vzestupně                       |
| `Access`     | string   | ne      | Popisný řetězec přístupu (např. "Všichni", "MI6"), výchozí "Všichni" |

### Vazba na WorldService (scope)

Pole `WorldId` určuje, do jakého prostoru skupina patří:

- `WorldId == null` nebo `WorldId == MatrixConstants.MatrixWorldId` → patří do globálního Matrix chatu
- `WorldId == <ObjectId světa>` → patří do konkrétního světa

Skupiny různých světů nejsou sdíleny navzájem ani s Matrix chatem.

---

## Seed dat (výchozí skupiny)

Při startu aplikace se pro Matrix úroveň automaticky seedují výchozí skupiny — pouze pokud skupina se stejným názvem ještě neexistuje:

- Globální
- Evropani
- Lumíci
- MI6
- Komunikace Hráči
- Komunikace s PJ

Pro světy se skupiny **neseedují** automaticky. PJ si vytváří vlastní přes API.

---

## API endpointy skupin

Základní cesta: `/api/chat/groups`

| Metoda | Cesta                   | Autorizace              | Query params | Popis                                                           |
|--------|-------------------------|-------------------------|--------------|-----------------------------------------------------------------|
| GET    | `/api/chat/groups`      | Přihlášený              | `worldId?`   | Bez worldId vrátí Matrix skupiny; s worldId vrátí skupiny světa |
| POST   | `/api/chat/groups`      | PJ / Admin / Superadmin | `worldId?`   | Vytvoří skupinu; s worldId přiřadí ke světu                     |
| PUT    | `/api/chat/groups/{id}` | PJ / Admin / Superadmin | —            | Aktualizuje skupinu; 404 pokud neexistuje                       |
| DELETE | `/api/chat/groups/{id}` | PJ / Admin / Superadmin | —            | Smaže skupinu; 404 pokud neexistuje                             |

### Poznámky

- `Name` je povinné při vytváření (400 pokud chybí).
- Skupiny jsou řazeny podle `Order` vzestupně.
- Skupiny jsou pouze organizační kategorie v sidebaru — kanály se do skupin přiřazují přes pole `ChatChannel.GroupId`.
