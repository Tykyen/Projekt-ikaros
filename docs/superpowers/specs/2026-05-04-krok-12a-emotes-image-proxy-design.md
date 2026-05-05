# Krok 12a — Custom Emotes & Image proxy — Design spec

**Datum:** 2026-05-04  
**Status:** Schváleno

---

## Přehled

Dva nezávislé subsystémy:

1. **Custom Emotes** — per-world a globální emoji shortcody s Cloudinary obrázky, WebSocket broadcast, kopírování mezi světy.
2. **Image proxy** — HTTP 302 redirect na Cloudinary pro zpětnou kompatibilitu s uloženými public ID.

---

## 1. Datový model

### CustomEmote schema

Jedna kolekce `custom_emotes`, dvě logické skupiny přes `worldId`:

| Pole | Typ | Popis |
|------|-----|-------|
| `_id` | ObjectId | — |
| `worldId` | ObjectId \| null | null = globální emote |
| `name` | string | Zobrazovaný název |
| `shortcode` | string | Jen vnitřní část bez `:`, formát `[a-z0-9_]{2,32}` |
| `imageId` | string | Cloudinary public ID |
| `createdBy` | ObjectId | Server-filled — userId tvůrce |
| `createdAt` | Date | Server-filled |

**Indexy:**
- `{ worldId: 1, shortcode: 1 }` unique — zabrání kolizím v rámci světa nebo globálního prostoru

### Upload flow

Klient nejdřív nahraje obrázek přes existující `POST /api/upload`, dostane Cloudinary public ID. Pak zavolá POST na emotes endpoint s tímto ID. Backend žádný upload neprovádí.

---

## 2. API endpointy

### Per-world emotes

| Metoda | Cesta | Oprávnění | Popis |
|--------|-------|-----------|-------|
| GET | `/api/emotes/:worldId` | JWT, člen světa | Všechny emoty světa |
| POST | `/api/emotes/:worldId` | PJ / PomocnýPJ / Admin+ | Vytvoř emote |
| DELETE | `/api/emotes/:worldId/:id` | PJ / PomocnýPJ / Admin+ | Smaž emote |
| POST | `/api/emotes/:worldId/:id/copy` | PJ / PomocnýPJ v obou světech | Zkopíruj do jiného světa |

**POST body:**
```json
{ "name": "string", "shortcode": "string", "imageId": "string" }
```

**Copy body:**
```json
{ "targetWorldId": "string" }
```

### Globální emotes

| Metoda | Cesta | Oprávnění | Popis |
|--------|-------|-----------|-------|
| GET | `/api/emotes/global` | JWT | Všechny globální emoty |
| POST | `/api/emotes/global` | Admin / Superadmin | Vytvoř globální emote |
| DELETE | `/api/emotes/global/:id` | Admin / Superadmin | Smaž globální emote |

### Image proxy

| Metoda | Cesta | Oprávnění | Popis |
|--------|-------|-----------|-------|
| GET | `/api/images/*` | — (anon) | HTTP 302 redirect na Cloudinary URL |

Cloudinary public ID může obsahovat lomítka (folder path: `folder/image_name`), proto wildcard route `*` místo `:id`.

Cloudinary URL: `https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload/{captured_path}`

---

## 3. Validace & edge cases

### Shortcode

- Formát: pouze `[a-z0-9_]`, délka 2–32 znaků
- Klient odesílá bez dvojteček, backend ukládá bez dvojteček
- Unikátnost per `worldId` (globální = `worldId: null` jako vlastní prostor)
- Duplikát → `409 Conflict`

### Kopírování emote

1. Ověř PJ / PomocnýPJ roli volajícího v zdrojovém světě
2. Ověř PJ / PomocnýPJ roli volajícího v cílovém světě
3. Zkontroluj kolizi shortcodu v cílovém světě → `409 Conflict` pokud existuje
4. Vytvoř nový záznam s `worldId = targetWorldId`, původní zůstane nedotčen

### Image proxy

- Pokud Cloudinary vrátí 404, server přeposílá 302 na URL — Cloudinary vrátí svůj error klientovi
- Žádná autentizace, žádné cachování na straně serveru

---

## 4. Real-time (WebSocket)

Pouze per-world emoty:

- **Event:** `emote:created`
- **Room:** `world:{worldId}`
- **Payload:** celý emote objekt (bez `__v`)
- **Kdy:** po úspěšném POST /api/emotes/:worldId

Globální emoty bez WebSocket — mění se zřídka, klient načte při inicializaci aplikace.

---

## 5. Integrace s chatem

`:shortcode:` syntaxe je frontend zodpovědnost — backend ukládá zprávy jako plain text, neparsuje shortcody. Frontend při renderování zprávy nahradí `:shortcode:` za `<img>` tag s Cloudinary URL.

---

## 6. Co není součástí tohoto kroku

- Editace emote (name/shortcode/imageId) — YAGNI, PJ může smazat a vytvořit znovu
- Stránkování GET endpointů — počet emotů per world bude malý
- Per-world emoty viditelné v globálních kontextech (diskuze, galerie) — řeší frontend výběrem správného setu
