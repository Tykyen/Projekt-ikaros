# Krok 11b — IkarosArticles — Design spec

**Datum:** 2026-05-04  
**Stav:** schváleno  
**Přístup:** samostatný modul, schvalovací workflow, notifikace přes IkarosMessages

---

## 1. Cíl

Platformové články s workflow Draft→Pending→Published/Rejected, hodnocením 1–5 hvězd a notifikacemi přes IkarosMessages.

---

## 2. Schema (`ikaros_articles`)

```
title: string
content: string                    (Markdown)
category: string                   (Povidky | Poezie | Uvahy | Recenze | Postavy | Ostatni; default Ostatni)
authorId: string
authorName: string
status: string                     (Draft | Pending | Published | Rejected; default Draft)
rejectReason?: string
ratings: ArticleRating[]           (embedded array)
averageRating: number              (default 0, přepočítává se při rate)
createdAtUtc: Date
updatedAtUtc: Date
publishedAtUtc?: Date
```

### ArticleRating (embedded)
```
userId: string
stars: number                      (1–5)
```

Max 1 záznam per userId — při opakovaném hodnocení se starý nahradí (upsert).

### Indexy
- `(authorId)` — GET /my
- `(status, createdAtUtc DESC)` — GET / a GET /pending

---

## 3. Kdo je „admin"

Role: `Superadmin | Admin | PJ | SpravceClankuu` nebo `username === "Tyky"`.

---

## 4. Workflow

```
Draft → [submit] → Pending → [approve] → Published
                            → [reject]  → Rejected → [edit + submit] → Pending
```

- POST s `submit: true` → stav rovnou Pending
- Editovat (PUT) lze jen Draft nebo Rejected
- Smazat (DELETE) může autor v libovolném stavu nebo admin

---

## 5. API (`/api/ikaros-articles`)

```
GET    /                    JWT — Published; admin vidí navíc Pending; řazeno createdAtUtc DESC
GET    /my                  JWT — vlastní všechny stavy; řazeno updatedAtUtc DESC
GET    /pending             Admin — jen Pending
GET    /stats               JWT — { draft, pending, published, rejected, totalRatings, averageRating } pro aktuálního autora
GET    /:id                 JWT — non-Published vidí jen autor nebo admin
POST   /                    JWT — body: { title, content, category?, submit?: bool }
PUT    /:id                 JWT autor — jen Draft nebo Rejected; body: { title?, content?, category? }
DELETE /:id                 JWT — autor nebo admin
POST   /:id/submit          JWT autor — Draft nebo Rejected → Pending
POST   /:id/approve         Admin — Pending → Published; nastaví publishedAtUtc
POST   /:id/reject          Admin — → Rejected; body: { reason?: string }
POST   /:id/rate            JWT — body: { stars: 1–5 }; autor nemůže hodnotit vlastní; vrátí { averageRating, totalRatings }
```

---

## 6. Notifikace (IkarosMessages)

Každá service metoda volá privátní helper `notifyAdmins()` nebo `notifyUser()`.

| Akce | Příjemci | Subject | Body |
|---|---|---|---|
| submit | všichni Superadmin/Admin/PJ/SpravceClankuu + username Tyky | „Článek čeká na schválení" | odkaz `/ikaros/clanky/:id` |
| approve | autor | „Článek schválen" | — |
| reject | autor | „Článek zamítnut" | rejectReason (pokud vyplněn) |

---

## 7. Modul

`backend/src/modules/ikaros-articles/`
- `schemas/ikaros-article.schema.ts`
- `ikaros-articles.controller.ts`
- `ikaros-articles.service.ts`
- `ikaros-articles.module.ts`
- `dto/create-article.dto.ts`
- `dto/update-article.dto.ts`
- `dto/rate-article.dto.ts`
- `dto/reject-article.dto.ts`
- `interfaces/ikaros-articles-repository.interface.ts`
- `repositories/ikaros-articles.repository.ts`
