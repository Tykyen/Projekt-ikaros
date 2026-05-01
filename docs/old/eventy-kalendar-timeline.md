# Eventy, Kalendář, Timeline

## 1. Herní eventy

### Datový model `GameEvent`

MongoDB kolekce konfigurovaná přes `MongoDBSettings.GameEventsCollectionName`.

| Pole | Typ | Popis |
|------|-----|-------|
| `Id` | `string` (ObjectId) | MongoDB primární klíč |
| `WorldId` | `string?` | ID světa; `null` nebo `MatrixWorldId` = globální event |
| `Title` | `string` | Název eventu — povinné |
| `Date` | `string` | ISO datum `YYYY-MM-DDTHH:mm` — povinné, slouží i jako řadicí klíč |
| `TargetGroup` | `string?` | Cílová skupina hráčů |
| `ImageUrl` | `string?` | URL obrázku |
| `Description` | `string?` | Popis |
| `Confirmable` | `bool` | Zda event podporuje RSVP (výchozí `false`) |
| `ConfirmedBy` | `List<EventConfirmation>` | Seznam potvrzených účastníků (výchozí prázdný seznam) |

**`EventConfirmation`** — vnořený objekt v `ConfirmedBy`:
- `UserId` — ID uživatele
- `UserName` — zobrazované jméno

**DB index:** složený compound index `(WorldId ASC, Date ASC)`, vytvářený při startu služby s `Background = true`.

---

### RSVP systém — `ConfirmedBy` toggle

Endpoint `POST /api/events/{id}/confirm` vyžaduje autentizaci (libovolná role).

Tělo požadavku (`EventConfirmDto`):
```json
{ "userId": "abc123", "userName": "Hráč X" }
```

Logika toggle:
1. Načte event dle `id`.
2. Zkontroluje `evt.Confirmable` — pokud `false`, vrátí `400 "Tato akce nepodporuje potvrzení účasti."`.
3. Hledá v `evt.ConfirmedBy` záznam se shodným `UserId`.
   - Nalezen → odstraní ho (`RemoveAt`).
   - Nenalezen → přidá nový `EventConfirmation`.
4. Uloží celý event přes `ReplaceOne`.
5. Vrátí `200 OK` s aktualizovaným eventem.

---

### API endpointy

Základní cesta: `api/events`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/events` | anonymous | Vrátí všechny eventy. Query params: `worldId`, `limit` (int), `fromDate` (ISO string). Filtry se aplikují na serveru v MongoDB. |
| `GET` | `/api/events/{id}` | anonymous | Vrátí jeden event nebo `404`. |
| `POST` | `/api/events` | PJ / Admin / Superadmin | Vytvoří event. Query param `worldId` (nepovinný). Povinné: `title`, `date`. Vrátí `201 Created`. |
| `PUT` | `/api/events/{id}` | PJ / Admin / Superadmin | Aktualizuje event. Pokud příchozí `ConfirmedBy` je prázdný nebo null, zachová se stávající seznam — nedojde ke ztrátě RSVP dat. |
| `DELETE` | `/api/events/{id}` | PJ / Admin / Superadmin | Smaže event nebo `404`. |
| `POST` | `/api/events/{id}/confirm` | Authorize (libovolná role) | Toggle RSVP pro daného uživatele. |

**Filtrování v `GET /api/events`:**
- Pokud `worldId` je zadáno a není `MatrixWorldId`, volá `GetByWorld(worldId, limit, fromDate)`.
- Jinak volá `GetAll(limit, fromDate)` — vrací eventy s `WorldId == null` nebo `WorldId == MatrixWorldId`.
- `fromDate` se překládá na MongoDB filter `Date >= fromDate` (string porovnání, funguje díky ISO formátu).
- Výsledky jsou vždy řazeny vzestupně dle `Date`.

---

## 2. GameEventCleanupService

`GameEventCleanupService` je `BackgroundService` (hostovaná služba), která automaticky maže prošlé eventy.

**Interval:** každou hodinu (`TimeSpan.FromHours(1)`).

**Cutoff logika (v `GameEventsService.DeleteExpired()`):**
```
cutoff = DateTime.UtcNow.AddHours(-24).ToString("yyyy-MM-ddTHH:mm")
```
Smaže všechny eventy, kde `Date < cutoff` — tedy eventy starší než 24 hodin.

Mazání probíhá přímo na MongoDB serveru přes `DeleteMany(filter)` — žádná data se nenačítají do paměti.

**Průběh cyklu:**
1. Zavolá `DeleteExpired()`.
2. Pokud `deleted > 0`, zaloguje `"GameEventCleanup: Removed {Count} expired event(s)."`.
3. Pokud nastane výjimka, zaloguje chybu a pokračuje v dalším cyklu.
4. Čeká 1 hodinu (`Task.Delay(Interval, stoppingToken)`).
5. Opakuje, dokud není `stoppingToken` zrušen.

Služba se registruje jako `IHostedService` — spouští se automaticky se startem aplikace.

---

## 3. Kalendář

### Datový model `Calender`

MongoDB kolekce konfigurovaná přes `MongoDBSettings.CalendersCollectionName`.

| Pole | Typ | Popis |
|------|-----|-------|
| `Id` | `string` (ObjectId) | MongoDB primární klíč |
| `WorldId` | `string?` | ID světa; `null` nebo `MatrixWorldId` = globální |
| `Slug` | `string` | Identifikátor kalendáře (v DB uložen jako `characterSlug`) — klíč pro vyhledávání |
| `Events` | `List<CalendarEvent>` | Seznam událostí v kalendáři |

**Vnořený model `CalendarEvent`:**

| Pole | Typ | Popis |
|------|-----|-------|
| `Id` | `string` | Vlastní ID události (ne ObjectId) |
| `Title` | `string` | Název |
| `Description` | `string?` | Popis |
| `Start` | `DateTime` | Začátek — ukládán jako LocalTime |
| `End` | `DateTime?` | Konec — nepovinný, LocalTime |
| `hourStart` | `string?` | Čas začátku jako textový řetězec |
| `hourEnd` | `string?` | Čas konce jako textový řetězec |
| `AllDay` | `bool` | Celodenní událost (výchozí `false`) |

---

### API endpointy

Základní cesta: `api/calenders`

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/api/calenders` | Vrátí všechny kalendáře. Query param `worldId` pro filtrování. |
| `GET` | `/api/calenders/{slug}` | Vrátí kalendář dle slugu nebo `null`. |
| `POST` | `/api/calenders` | Vytvoří nový kalendář. Tělo: celý `Calender` objekt. |
| `PUT` | `/api/calenders/{slug}` | Upsert — viz níže. |
| `POST` | `/api/calenders/fix-orphan` | Opraví `WorldId` u kalendáře. Query params: `slug`, `worldId`. |
| `DELETE` | `/api/calenders/{slug}` | Smaže kalendář dle slugu. |

**Endpointy nemají `[Authorize]` — autorizace není řešena na úrovni controlleru.**

---

### Upsert logika (`PUT /api/calenders/{slug}`)

Tělo požadavku: `List<CalendarEvent>` (pouze seznam událostí, ne celý `Calender`).

1. Načte existující kalendář dle `slug`.
2. **Pokud neexistuje:** vytvoří nový `Calender` s daným `slug`, `worldId` (z query), a předanými `events`. Volá `Create()`.
3. **Pokud existuje:** aktualizuje pouze pole `Events` přes `UpdateOne` s `$set`. Celý dokument se nenahrazuje.
4. Pokud `worldId` v query se liší od `existing.WorldId`, zavolá navíc `FixWorldId(slug, worldId)` — opraví `WorldId` separátním `UpdateOne`.
5. Vždy vrátí `204 No Content`.

Chyby jsou zachyceny `try/catch` a vrátí `500` s `ex.Message` a `ex.StackTrace`.

---

## 4. Timeline

### Datový model `TimelineEvent`

MongoDB kolekce konfigurovaná přes `MongoDBSettings.TimelineEventsCollectionName`.

| Pole | Typ | Popis |
|------|-----|-------|
| `Id` | `string` (ObjectId) | MongoDB primární klíč |
| `WorldId` | `string?` | ID světa; `null` nebo `MatrixWorldId` = globální |
| `Year` | `string` | **Herní rok jako string** — povinné. Umožňuje fantastické formáty (např. `"1200 n.e."`, `"Rok Draka"`). |
| `Month` | `string?` | Herní měsíc jako string — nepovinné |
| `Day` | `string?` | Herní den jako string — nepovinné |
| `Text` | `string` | Popis události — povinné |
| `ImageUrl` | `string?` | URL nebo base64 data URI obrázku |
| `Link` | `string?` | Odkaz na detail |

---

### API endpointy

Základní cesta: `api/timeline`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/timeline` | anonymous | Vrátí všechny události. Query param `worldId`. Base64 obrázky jsou stripovány — viz níže. |
| `GET` | `/api/timeline/{id}` | anonymous | Vrátí jednu událost nebo `404`. Base64 **není** stripováno (vrací plná data). |
| `POST` | `/api/timeline` | PJ / Admin / Superadmin | Vytvoří událost. Query param `worldId`. Povinné: `year`, `text`. Vrátí `201 Created`. |
| `PUT` | `/api/timeline/{id}` | PJ / Admin / Superadmin | Aktualizuje událost — viz base64 zachování níže. |
| `DELETE` | `/api/timeline/{id}` | PJ / Admin / Superadmin | Smaže událost nebo `404`. |

---

### Stripování base64 v `GET /api/timeline`

`GetAll` iteruje všechny vrácené události a pro každou zkontroluje:
```csharp
if (ev.ImageUrl != null && ev.ImageUrl.StartsWith("data:"))
    ev.ImageUrl = null;
```
Base64 data URI jsou nahrazena `null` — odpověď zůstává malá a rychlá.

`GET /api/timeline/{id}` base64 **nestrihuje** — vrátí plná data pro detail.

### Zachování legacy base64 při `PUT`

Protože `GetAll` vrací `ImageUrl = null` pro base64 obrázky, frontend při editaci pošle `null` místo skutečného base64. Controller to řeší:

```csharp
if (evt.ImageUrl == null && existing.ImageUrl != null && existing.ImageUrl.StartsWith("data:"))
{
    evt.ImageUrl = existing.ImageUrl;
}
```

Pokud příchozí `ImageUrl` je `null` a stávající hodnota v DB je base64, zachová se původní DB hodnota. Tím se zamezí nechtěnému smazání obrázků při textové editaci záznamu.
