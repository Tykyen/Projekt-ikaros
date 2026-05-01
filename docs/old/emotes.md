# Emotes

## Model `CustomEmote`

Kolekce: `"CustomEmotes"` (hardcoded v `EmotesService`).

| Pole | Typ | Popis |
|---|---|---|
| `Id` | ObjectId (string) | `_id` |
| `WorldId` | string | ID světa, ke kterému emote patří |
| `Name` | string | Zobrazovaný název (např. `"Smile"`) |
| `Shortcode` | string | Kód pro použití v chatu (např. `":smile:"`) |
| `ImageId` | string | ID souboru na Google Drive (obraz emote) |
| `CreatedAt` | DateTime UTC | Čas vytvoření |

**`CustomEmoteCreateDto`:** `Name`, `Shortcode`, `ImageId` (bez `WorldId` a `CreatedAt` — ty doplňuje controller).

---

## Vazba na Google Drive

`ImageId` je ID souboru na Google Drive — neobsahuje přímé URL. Frontend si URL sestaví samostatně (např. `https://drive.google.com/uc?id={ImageId}`). Správa souborů (upload, mazání z Drive) probíhá mimo tento backend.

---

## Per-world izolace

Každý emote má `WorldId`. Dotazy (`GetEmotesByWorldAsync`, `DeleteEmoteAsync`) vždy filtrují i dle `WorldId` — cross-world přístup k emotes není možný.

Řazení: `GetEmotesByWorldAsync` vrací emotes sestupně dle `CreatedAt`.

---

## Manuální role check

Endpointy `POST` a `DELETE` mají `[Authorize]`, ale kontrola role (PJ/Admin/Superadmin) je manuální v controlleru přes `User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role)`, ne přes `[Authorize(Roles=...)]`. Důvod: endpoint přijímá `worldId` z URL a role se kontroluje až po jeho zpracování.

Běžní uživatelé (Player, Korektor) mohou emotes číst (GET), ale nemohou je vytvářet ani mazat.

---

## API endpointy

Základní cesta: `api/emotes`

| Metoda | Endpoint | Auth | Popis |
|---|---|---|---|
| GET | `/api/emotes/{worldId}` | Authorize | Všechny emotes daného světa, sestupně dle `CreatedAt` |
| POST | `/api/emotes/{worldId}` | Authorize + PJ/Admin/Superadmin (manuální check) | Vytvoří emote; body: `{ Name, Shortcode, ImageId }` |
| DELETE | `/api/emotes/{worldId}/{id}` | Authorize + PJ/Admin/Superadmin (manuální check) | Smaže emote; validuje `WorldId` i `Id` |
