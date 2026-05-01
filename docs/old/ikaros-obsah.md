# Ikaros — obsah (backend dokumentace)

Všechny controllery jsou v namespace `matrixBackend.Controllers`, modely v `matrixBackend.Models`.
Databáze: MongoDB. Autentizace: JWT Bearer (`[Authorize]` na úrovni controlleru, pokud není uvedeno jinak).

---

## 1. Články

### Model `IkarosArticle`

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `Title` | `string` | `""` | Název článku |
| `Content` | `string` | `""` | Obsah (HTML/Markdown) |
| `Category` | `string` | `"Ostatni"` | Povidky / Poezie / Uvahy / Recenze / Postavy / Ostatni |
| `AuthorId` | `string` | `""` | ID autora |
| `AuthorName` | `string` | `""` | Username autora (denormalizováno) |
| `Status` | `string` | `"Draft"` | Draft / Pending / Published / Rejected |
| `RejectReason` | `string?` | null | Důvod zamítnutí (vyplní admin) |
| `Ratings` | `List<ArticleRating>` | `[]` | Pole hodnocení (jeden záznam per uživatel) |
| `AverageRating` | `double` | `0` | Průměr z `Ratings`, zaokrouhleno na 1 des. místo |
| `CreatedAtUtc` | `DateTime` | now | |
| `UpdatedAtUtc` | `DateTime` | now | Aktualizuje se při každé změně |
| `PublishedAtUtc` | `DateTime?` | null | Nastavuje se při schválení |

#### `ArticleRating`

| Pole | Typ | Popis |
|---|---|---|
| `UserId` | `string` | ID hodnotícího uživatele |
| `Stars` | `int` | 1–5 |

Každý uživatel může mít v poli `Ratings` maximálně jeden záznam — při opakovaném hodnocení se starý odstraní a přidá nový.

### API endpointy — `GET /api/IkarosArticles`

| Metoda | Cesta | Auth | Popis |
|---|---|---|---|
| GET | `/api/IkarosArticles` | Ano | Všechny Published. Admin/PJ/SpravceClankuu vidí navíc Pending. Řazeno: `CreatedAtUtc DESC` |
| GET | `/api/IkarosArticles/my` | Ano | Vlastní články aktuálního uživatele (všechny stavy). Řazeno: `UpdatedAtUtc DESC` |
| GET | `/api/IkarosArticles/pending` | Admin | Pouze Pending. Non-admin → 403 |
| GET | `/api/IkarosArticles/stats` | Ano | Statistiky autora: počty dle stavu + `totalRatings` + `averageRating` |
| GET | `/api/IkarosArticles/{id}` | Ano | Jeden článek. Non-Published vidí jen autor nebo admin |
| POST | `/api/IkarosArticles` | Ano | Vytvoření článku. DTO: `CreateArticleDto` |
| PUT | `/api/IkarosArticles/{id}` | Ano (autor) | Úprava. Povoleno jen pro Draft nebo Rejected |
| DELETE | `/api/IkarosArticles/{id}` | Ano (autor nebo admin) | Smazání |
| POST | `/api/IkarosArticles/{id}/submit` | Ano (autor) | Draft/Rejected → Pending. Spustí notifikaci adminům |
| POST | `/api/IkarosArticles/{id}/approve` | Admin | Pending → Published. Nastaví `PublishedAtUtc`. Notifikace autorovi |
| POST | `/api/IkarosArticles/{id}/reject` | Admin | → Rejected. Uloží `RejectReason`. Notifikace autorovi |
| POST | `/api/IkarosArticles/{id}/rate` | Ano | Hodnocení 1–5. Autor nemůže hodnotit vlastní. Vrátí `{ averageRating, totalRatings }` |

### Schvalovací tok

```
Draft → [Submit] → Pending → [Approve] → Published
                           → [Reject]  → Rejected → [Update + Submit] → Pending
```

- Při vytvoření s `Submit: true` se rovnou přeskočí na Pending.
- Upravovat lze jen Draft nebo Rejected.
- Smazat může autor v libovolném stavu nebo admin.

### Notifikace (IkarosMessage)

- **Submit / Create s `Submit: true`** — zpráva každému uživateli s rolí Superadmin, Admin, PJ nebo SpravceClankuu. Tělo obsahuje odkaz `/ikaros/clanky/{id}`.
- **Approve** — zpráva autorovi. Subject: „Článek schválen".
- **Reject** — zpráva autorovi. Subject: „Článek zamítnut". Tělo obsahuje `RejectReason` pokud je vyplněn.

### Kdo je „admin" (IsAdminOrSuperadmin)

Role: `Superadmin`, `Admin`, `PJ`, `SpravceClankuu` — nebo username `Tyky`.

---

## 2. Diskuse

### Model `IkarosDiscussion`

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `Title` | `string` | `""` | Název diskuze |
| `Description` | `string` | `""` | Popis |
| `Bulletin` | `string` | `""` | Nástěnka/oznamení (editovatelné správci) |
| `CreatorId` | `string` (ObjectId) | `""` | ID tvůrce |
| `CreatorName` | `string` | `""` | Username tvůrce |
| `IsApproved` | `bool` | `false` | Admin musí schválit před zveřejněním |
| `IsOpen` | `bool` | `true` | true = veřejná, false = uzavřená (přístup jen pozvaným) |
| `ManagerIds` | `List<string>` | `[]` | Správci diskuze (mají práva editace, mazání příspěvků, pozvání) |
| `InvitedUserIds` | `List<string>` | `[]` | Pozvaní uživatelé (mají přístup k uzavřené diskuzi) |
| `CreatedAtUtc` | `DateTime` | now | |
| `LastActivityUtc` | `DateTime` | now | Aktualizuje se při přidání příspěvku |
| `PostCount` | `int` | `0` | Počet příspěvků (inkrementuje/dekrementuje se) |
| `LikeCount` | `int` | `0` | Počet lajků (pole připraveno, endpoint není implementován) |

### Model `IkarosDiscussionPost`

| Pole | Typ | Popis |
|---|---|---|
| `Id` | `string` (ObjectId) | MongoDB ID |
| `DiscussionId` | `string` (ObjectId) | Odkaz na `IkarosDiscussion.Id` |
| `AuthorId` | `string` (ObjectId) | ID autora |
| `AuthorName` | `string` | Username (denormalizováno) |
| `Content` | `string` | Text příspěvku |
| `CreatedAtUtc` | `DateTime` | Čas vytvoření |

Příspěvky jsou samostatná kolekce, ne embedded array v diskuzi.

### API endpointy — `GET /api/IkarosDiscussions`

| Metoda | Cesta | Auth | Popis |
|---|---|---|---|
| GET | `/api/IkarosDiscussions` | Ano | Seznam diskuzí. Admin vidí vše. User vidí jen `IsApproved == true` a (IsOpen nebo je pozván nebo je manager nebo je tvůrce) |
| GET | `/api/IkarosDiscussions/pending` | Admin | Neschválené diskuze |
| GET | `/api/IkarosDiscussions/my-favorites` | Ano | IDs oblíbených diskuzí aktuálního uživatele |
| GET | `/api/IkarosDiscussions/{id}` | Ano | Jedna diskuze. Uzavřená → 403 pokud uživatel není pozván/manager/tvůrce/admin |
| POST | `/api/IkarosDiscussions` | Ano | Vytvoření. DTO: `CreateDiscussionDto`. Admin → auto-approved |
| PATCH | `/api/IkarosDiscussions/{id}` | Manager nebo Admin | Částečná úprava (title, description, bulletin, isOpen) |
| DELETE | — | — | Endpoint pro smazání diskuze neexistuje (jen přes reject) |
| POST | `/api/IkarosDiscussions/{id}/approve` | Admin | `IsApproved = true`. Notifikace tvůrci |
| POST | `/api/IkarosDiscussions/{id}/reject` | Admin | Smaže diskuzi + všechny příspěvky. Notifikace tvůrci s důvodem |
| POST | `/api/IkarosDiscussions/{id}/invite` | Manager nebo Admin | Přidá userId do `InvitedUserIds`. Notifikace pozvanému |
| POST | `/api/IkarosDiscussions/{id}/toggle-favorite` | Ano | Přepne oblíbenost (uloží do `User.FavoriteDiscussionIds`). Vrátí `{ isFavorite }` |
| GET | `/api/IkarosDiscussions/{id}/posts` | Ano | Příspěvky diskuze. Query params: `skip` (výchozí 0), `limit` (výchozí 50). Řazeno: `CreatedAtUtc ASC` |
| POST | `/api/IkarosDiscussions/{id}/posts` | Ano | Přidání příspěvku. DTO: `AddPostDto`. Diskuze musí být `IsApproved`. Aktualizuje `PostCount` a `LastActivityUtc` |
| DELETE | `/api/IkarosDiscussions/{id}/posts/{postId}` | Autor nebo Manager nebo Admin | Smazání příspěvku. Dekrementuje `PostCount` |

### Otevřené vs. uzavřené diskuze

- **Otevřená** (`IsOpen = true`): přístupná všem přihlášeným uživatelům (pokud je schválená).
- **Uzavřená** (`IsOpen = false`): přístup mají jen `CreatorId`, `ManagerIds`, `InvitedUserIds` a admins.
- `IsOpen` lze za běhu přepnout přes PATCH (manager nebo admin).

### ManagerIds

- Při vytvoření diskuze je `CreatorId` automaticky přidán do `ManagerIds`.
- Manageři mohou: editovat diskuzi (PATCH), pozvat uživatele (invite), mazat příspěvky cizích uživatelů.
- Další manageři lze přidat jen přes přímou editaci MongoDB (endpoint pro přidání managera neexistuje).

### Notifikace

- **Vytvoření (non-admin)** — zpráva všem adminům (Superadmin, Admin, PJ, SpravceDisukzi + Tyky). Subject: „Nová diskuze čeká na schválení".
- **Approve** — zpráva tvůrci. Subject: „Vaše diskuze byla schválena".
- **Reject** — zpráva tvůrci s důvodem. Subject: „Vaše diskuze byla zamítnuta".
- **Invite** — zpráva pozvanému uživateli s odkazem na diskuzi.

### Kdo je „admin" (IsAdminOrSuperadmin)

Role: `Admin`, `Superadmin`, `PJ`, `SpravceDisukzi` — nebo username `Tyky`.

---

## 3. Galerie

### Model `IkarosGalleryImage`

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `Title` | `string` | `""` | Název obrázku |
| `Description` | `string` | `""` | Popis |
| `ImageUrl` | `string` | `""` | **Google Drive File ID** (ne URL — jen ID souboru na Google Drive) |
| `AuthorId` | `string` (ObjectId) | `""` | ID autora |
| `AuthorName` | `string` | `""` | Username (denormalizováno) |
| `Status` | `string` | `"Draft"` | Draft / Pending / Published / Rejected |
| `RejectReason` | `string` | `""` | Důvod zamítnutí |
| `Ratings` | `List<GalleryRating>` | `[]` | Hodnocení (jeden záznam per uživatel) |
| `AverageRating` | `double` | `0` | Průměr, zaokrouhleno na 1 des. místo |
| `CreatedAtUtc` | `DateTime` | now | |
| `UpdatedAtUtc` | `DateTime` | now | |
| `PublishedAtUtc` | `DateTime?` | null | Nastaví se při approve |

#### `GalleryRating`

| Pole | Typ | Popis |
|---|---|---|
| `UserId` | `string` | ID hodnotícího |
| `Stars` | `int` | 1–5 |

#### Poznámka k ImageUrl

`ImageUrl` ukládá **Google Drive File ID**, nikoliv plnou URL. Frontend si z něj sestaví URL sám (typicky `https://drive.google.com/uc?id={ImageUrl}`). Nahrávání probíhá přes `GoogleDriveService.UploadFileAsync()`.

### API endpointy — `GET /api/IkarosGallery`

| Metoda | Cesta | Auth | Popis |
|---|---|---|---|
| GET | `/api/IkarosGallery` | Ano | Všechny Published. Admin vidí navíc Pending. Řazeno: `CreatedAtUtc DESC` |
| GET | `/api/IkarosGallery/my` | Ano | Vlastní obrázky (všechny stavy). Řazeno: `UpdatedAtUtc DESC` |
| GET | `/api/IkarosGallery/pending` | Admin | Pouze Pending |
| GET | `/api/IkarosGallery/stats` | Ano | Statistiky autora (počty dle stavu + ratings) |
| GET | `/api/IkarosGallery/{id}` | Ano | Jeden obrázek. Non-Published vidí jen autor nebo admin |
| POST | `/api/IkarosGallery` | Ano | Upload souboru. `multipart/form-data`: `file` (IFormFile), `title` (string), `description?` (string), `submit?` (bool). Nahraje na Google Drive, uloží File ID |
| PUT | `/api/IkarosGallery/{id}` | Ano (autor) | Úprava metadat (title, description). Jen Draft nebo Rejected |
| DELETE | `/api/IkarosGallery/{id}` | Ano (autor nebo admin) | Smazání záznamu z MongoDB (soubor na Google Drive se nesmaže) |
| POST | `/api/IkarosGallery/{id}/submit` | Ano (autor) | Draft/Rejected → Pending. Notifikace adminům |
| POST | `/api/IkarosGallery/{id}/approve` | Admin | → Published. Nastaví `PublishedAtUtc`. Notifikace autorovi |
| POST | `/api/IkarosGallery/{id}/reject` | Admin | → Rejected. Uloží `RejectReason`. Notifikace autorovi |
| POST | `/api/IkarosGallery/{id}/rate` | Ano | Hodnocení 1–5. Autor nemůže hodnotit vlastní. Vrátí `{ averageRating, totalRatings }` |

### Schvalovací tok (stejný jako u článků)

```
Draft → [Submit] → Pending → [Approve] → Published
                           → [Reject]  → Rejected → [Update + Submit] → Pending
```

### Notifikace

- **Submit** — zpráva každému s rolí Superadmin, Admin, PJ, SpravceClankuu nebo SpravceGalerie. Subject: „Nový obrázek ke schválení". Odkaz `/ikaros/galerie/{id}`.
- **Approve** — zpráva autorovi. Subject: „Obrázek schválen".
- **Reject** — zpráva autorovi s `RejectReason`. Subject: „Obrázek zamítnut".

### Kdo je „admin" (IsAdminOrSuperadmin)

Role: `Superadmin`, `Admin`, `PJ`, `SpravceClankuu`, `SpravceGalerie` — nebo username `Tyky`.

Galerie oproti článkům navíc zahrnuje roli `SpravceGalerie` (jak v IsAdminOrSuperadmin, tak v NotifyAdmins).

---

## 4. News

### Model `IkarosNews`

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `Title` | `string` | `""` | Nadpis novinky |
| `Content` | `string` | `""` | Text novinky |
| `AuthorId` | `string` | `""` | ID autora (vyplní controller, ne klient) |
| `AuthorName` | `string` | `""` | Username autora (vyplní controller) |
| `CreatedAtUtc` | `DateTime` | now | Vyplní controller |
| `IsActive` | `bool` | `true` | Vyplní controller na `true` při vytvoření |

Neexistuje žádný stav (Draft/Published), `IsActive` je jediný příznak viditelnosti.

### API endpointy — `GET /IkarosNews`

> **Odlišný route prefix:** controller používá `[Route("[controller]")]` místo `[Route("api/[controller]")]`.
> Výsledná základní cesta je `/IkarosNews`, ne `/api/IkarosNews`.

| Metoda | Cesta | Auth | Popis |
|---|---|---|---|
| GET | `/IkarosNews` | **Anonymní** (`[AllowAnonymous]`) | Všechny aktivní novinky (`IsActive == true`). Řazeno: `CreatedAtUtc DESC` |
| POST | `/IkarosNews` | Superadmin / Admin / PJ | Vytvoření novinky. Tělo: objekt `IkarosNews` (klient posílá jen `Title` a `Content`). Ostatní pole vyplní server |
| DELETE | `/IkarosNews/{id}` | Superadmin / Admin / PJ | Smazání (tvrdé, ne soft-delete). Ostatní role → 403 |

### Odlišnosti oproti ostatním modulům

- GET je veřejný bez autentizace.
- Žádný schvalovací tok — novinky se publikují okamžitě.
- Žádné hodnocení, žádné drafty.
- Oprávnění pro zápis jsou přísnější: pouze Superadmin, Admin nebo PJ (SpravceClankuu ani SpravceGalerie nestačí).
- Route bez `api/` prefixu.
