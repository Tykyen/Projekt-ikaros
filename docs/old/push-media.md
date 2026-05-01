# Push notifikace, média a zvuky

## 1. Push notifikace

### VAPID flow

Aplikace používá Web Push protokol s VAPID autentizací (knihovna `WebPush` NuGet).

Konfigurace se načítá z `VapidSettings` (options pattern):

```csharp
public class VapidSettings
{
    public string PublicKey { get; set; }   // VAPID public key (base64url)
    public string PrivateKey { get; set; }  // VAPID private key (base64url)
    public string Subject { get; set; }     // mailto: nebo URL kontaktu
}
```

Flow:
1. Klient zavolá `GET /api/push/vapid-public-key` (anonymní) → dostane `{ publicKey }`.
2. Prohlížeč se přihlásí k odběru přes `PushManager.subscribe()` s tímto klíčem.
3. Klient pošle výslednou subscription na `POST /api/push/subscribe` (JWT required) → uloží se do MongoDB.
4. Backend kdykoli zavolá `WebPushService.SendNotification()` → odešle push přes VAPID.

### Model PushSubscription

MongoDB kolekce: `settings.Value.PushSubscriptionsCollectionName`

```
PushSubscriptionModel
  Id         ObjectId
  UserId     string       — MongoDB ID uživatele
  Endpoint   string       — URL push služby prohlížeče (unikátní index)
  P256dh     string       — šifrovací klíč klienta
  Auth       string       — autentizační tajemství
  CreatedAt  DateTime     — UTC čas vytvoření
```

DTO přijímaný od klienta:

```
PushSubscriptionDto
  Endpoint   string
  Keys
    P256dh   string
    Auth     string
```

Indexy: `Endpoint` (unique), `UserId`.

### PushSubscriptionService

| Metoda | Popis |
|---|---|
| `GetAll()` | Vrátí všechny subscription. |
| `GetByUserId(userId)` | Subscription daného uživatele. |
| `Upsert(userId, dto)` | Pokud subscription s daným `Endpoint` existuje, aktualizuje `UserId`, `P256dh`, `Auth`. Pokud ne, vloží nový záznam. |
| `Delete(endpoint)` | Smaže subscription dle `Endpoint`. |

### WebPushService

`SendNotification(subscription, title, message, url?)` sestaví payload:

```json
{ "title": "...", "message": "...", "url": "..." }
```

Odešle přes `WebPushClient.SendNotificationAsync()` s VAPID detaily.

### Auto-mazání expirovaných subscriptions

Při odeslání notifikace může push služba vrátit HTTP 404 nebo 410 — subscription již neexistuje nebo byla zrušena. `WebPushService` tuto situaci zachytí v `catch (WebPushException ex)` a automaticky zavolá `PushSubscriptionService.Delete(endpoint)`. Jiné chyby se pouze logují.

### API endpointy

Všechny pod `/api/push`, JWT required (kromě veřejného klíče).

| Metoda | Endpoint | Auth | Popis |
|---|---|---|---|
| GET | `/api/push/vapid-public-key` | Anonymní | Vrátí VAPID public key: `{ publicKey }` |
| POST | `/api/push/subscribe` | JWT | Uloží/aktualizuje subscription. Body: `PushSubscriptionDto`. Uživatel se určí z JWT (`sub` claim). |
| POST | `/api/push/unsubscribe` | JWT | Smaže subscription. Body: string (endpoint URL). |

---

## 2. Google Drive integrace

### Service Account autentizace

`GoogleDriveService` se inicializuje v konstruktoru. Přihlašovací údaje se načítají ve dvou krocích:

1. Primárně z `IConfiguration` (klíče `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`).
2. Fallback na proměnné prostředí se stejnými názvy.

Pokud ani jedno není nastaveno, konstruktor vyhodí `ArgumentException`.

Private key prochází normalizací: `key.Replace("\\n", "\n").Trim('"').Trim()` — zvládá jak literální `\n` (z JSON konfigurace), tak skutečné nové řádky.

Scope: `DriveService.Scope.DriveFile` (přístup pouze k souborům vytvořeným aplikací).

```csharp
var credential = new ServiceAccountCredential(
    new ServiceAccountCredential.Initializer(email)
    {
        Scopes = new[] { DriveService.Scope.DriveFile }
    }.FromPrivateKey(normalizedKey));
```

### Deduplikace souborů

`UploadFileAsync` před nahráním zkontroluje, zda soubor se stejným názvem (`file.FileName`) už ve složce existuje:

```
Q = "name = '{file.FileName}' and '1Mn__I9Ke_tojYfpRImkwparwhBKcQkRh' in parents and trashed = false"
```

Pokud ano, vrátí `Id` existujícího souboru a **nenahraje duplikát**.

### Jak se používá jako storage

1. Upload přes `UploadFileAsync(IFormFile)` → vrátí Google Drive `fileId` (string).
2. Po úspěšném uploadu se souboru nastaví oprávnění `role=reader, type=anyone` (veřejně čitelný).
3. `fileId` se uloží do databáze (např. jako URL obrázku ve světě, kampani, atd.).
4. Při servírování se zavolá `GetFileWithMetaAsync(fileId)` nebo `GetFileStreamAsync(fileId)`.

Cílová složka na Google Drive má hardcoded ID: `1Mn__I9Ke_tojYfpRImkwparwhBKcQkRh`.

### Metody

| Metoda | Popis |
|---|---|
| `UploadFileAsync(IFormFile)` | Deduplikace → upload → nastaví public reader → vrátí `fileId`. |
| `GetFileWithMetaAsync(fileId)` | Stáhne soubor do `MemoryStream` + vrátí `mimeType` z Drive metadata. |
| `GetFileStreamAsync(fileId)` | Stáhne soubor do `MemoryStream`, bez mime type. |

---

## 3. Upload

### UploadController

Cesta: `POST /api/upload/image`  
Autentizace: není (controller nemá `[Authorize]`).

Přijímá `multipart/form-data` s polem `file` (`IFormFile`).

Průběh:
1. Pokud `file` je null nebo prázdný → `400 Bad Request` s textem `"No file provided."`.
2. Zavolá `GoogleDriveService.UploadFileAsync(file)`.
3. Při úspěchu vrátí `200 OK`:

```json
{ "fileId": "<google-drive-file-id>" }
```

Vrácené `fileId` se pak předává jako hodnota do jiných entit (světy, postavy, apod.) a pro načtení se použije `GET /api/images/{id}`.

---

## 4. Obrázky

### ImageController

Cesta: `GET /api/images/{id}`  
Autentizace: není (controller nemá `[Authorize]`).

`id` je Google Drive `fileId`.

Průběh:
1. Zavolá `GoogleDriveService.GetFileWithMetaAsync(id)` — stáhne soubor do paměti a zjistí `mimeType`.
2. Vrátí `File(stream, mimeType ?? "image/png")` — binární stream s odpovídajícím Content-Type.
3. Při chybě vrátí `400 Bad Request`:

```json
{ "error": "Image fetch failed", "details": "<zpráva výjimky>" }
```

Soubor se stahuje do `MemoryStream` (nikoliv streamuje přímo z Drive), takže celý obsah je nejprve v paměti serveru.

---

## 5. Zvuky

### Model Sound

MongoDB kolekce: `settings.Value.SoundsCollectionName` (fallback `"sounds"`).

| Pole | Typ | Popis |
|---|---|---|
| `Id` | ObjectId | Primární klíč. |
| `Name` | string | Název zvuku. |
| `YoutubeUrl` | string | URL YouTube zdroje. |
| `MediaType` | enum | `music`, `ambient`, `sfx`, `signal`, `voice` |
| `PrimaryFunction` | enum | `safe`, `social`, `exploration`, `tension`, `threat`, `combat`, `ritual`, `horror`, `revelation`, `aftermath`, `transition`, `system` |
| `Environment` | enum | `neutral`, `nature`, `urban`, `interior`, `industrial`, `military`, `sacral`, `arcane`, `digital`, `alien`, `ruin`, `void` |
| `EmotionalTone` | enum | `calm`, `wonder`, `melancholy`, `mystery`, `dread`, `fear`, `urgency`, `aggression`, `grief`, `awe`, `faith`, `corruption` |
| `Intensity` | int | 1–5 |
| `Duration` | int | Délka v sekundách. |
| `Loop` | bool | Výchozí `true`. |
| `OnsetProfile` | enum | `instant`, `fast`, `soft`, `slow` |
| `OutroProfile` | enum | `hard`, `soft`, `fade`, `seamless` |
| `FactionStyle` | enum | `civilian`, `noble`, `religious`, `military`, `corporate`, `criminal`, `tribal`, `arcane`, `alien` |
| `TechLevel` | enum | `preindustrial`, `industrial`, `modern`, `advanced`, `posthuman` |
| `MagicLevel` | enum | `none`, `low`, `medium`, `high`, `extreme` |
| `CombatEnergy` | enum | `none`, `low`, `medium`, `high` |
| `Tags` | `List<string>` | Volné tagy. |
| `Notes` | string | Poznámky. |

### SoundsService

Přímý wrapper nad MongoDB kolekcí, bez cache ani indexů.

| Metoda | Popis |
|---|---|
| `Get()` | Vrátí všechny zvuky. |
| `Get(id)` | Vrátí zvuk dle `Id`, nebo `null`. |
| `Create(sound)` | Vloží nový dokument, vrátí ho (s přiděleným `Id`). |
| `Update(id, updatedSound)` | Nastaví `updatedSound.Id = id` a provede `ReplaceOne`. |
| `Delete(id)` | Smaže dokument dle `Id`. |

### CRUD endpointy

Cesta: `/api/sounds`, vše JWT required.

| Metoda | Endpoint | Vrací | Popis |
|---|---|---|---|
| GET | `/api/sounds` | `List<Sound>` 200 | Všechny zvuky. |
| GET | `/api/sounds/{id}` | `Sound` 200 nebo 404 | Jeden zvuk. |
| POST | `/api/sounds` | `Sound` 201 + Location header | Vytvoří zvuk. |
| PUT | `/api/sounds/{id}` | 204 nebo 404 | Aktualizuje zvuk (full replace). |
| DELETE | `/api/sounds/{id}` | 204 nebo 404 | Smaže zvuk. |

`POST` vrací `201 Created` s `Location: /api/sounds/{id}` hlavičkou (via `CreatedAtAction`).
