# Krok 11c — IkarosGallery — Design spec

**Datum:** 2026-05-04  
**Stav:** schváleno  
**Přístup:** samostatný modul, stejný workflow jako Articles, upload přes Cloudinary

---

## 1. Cíl

Galerie obrázků se schvalovacím workflow identickým s Articles. Upload přes existující `UploadService` → Cloudinary.

---

## 2. Schema (`ikaros_gallery`)

```
title: string
description?: string
imageUrl: string                   (Cloudinary public ID)
authorId: string
authorName: string
status: string                     (Draft | Pending | Published | Rejected; default Draft)
rejectReason?: string
ratings: GalleryRating[]           (embedded array)
averageRating: number              (default 0)
createdAtUtc: Date
updatedAtUtc: Date
publishedAtUtc?: Date
```

### GalleryRating (embedded)
```
userId: string
stars: number                      (1–5)
```

Max 1 záznam per userId — upsert při opakovaném hodnocení.

### Indexy
- `(authorId)` — GET /my
- `(status, createdAtUtc DESC)` — GET / a GET /pending

---

## 3. Kdo je „admin"

Role: `Superadmin | Admin | PJ | SpravceClankuu | SpravceGalerie` nebo `username === "Tyky"`.

(Oproti Articles navíc zahrnuje roli `SpravceGalerie`.)

---

## 4. Workflow

Identický s Articles:
```
Draft → [submit] → Pending → [approve] → Published
                            → [reject]  → Rejected → [edit + submit] → Pending
```

- POST s `submit: true` → stav rovnou Pending
- PUT povoleno jen pro Draft nebo Rejected (jen title a description — imageUrl nelze změnit)
- DELETE odstraní záznam z DB; soubor na Cloudinary se nesmaže

---

## 5. Upload flow

`POST /api/ikaros-gallery` přijme `multipart/form-data`:
- `file` — obrázek (povolené MIME typy: image/*)
- `title` — string
- `description` — string (volitelné)
- `submit` — bool (volitelné, default false)

Controller předá soubor `UploadService.uploadToCloudinary()` → získá Cloudinary public ID → uloží do `imageUrl`.

---

## 6. API (`/api/ikaros-gallery`)

```
GET    /                    JWT — Published; admin vidí navíc Pending; řazeno createdAtUtc DESC
GET    /my                  JWT — vlastní všechny stavy; řazeno updatedAtUtc DESC
GET    /pending             Admin — jen Pending
GET    /stats               JWT — { draft, pending, published, rejected, totalRatings, averageRating } pro aktuálního autora
GET    /:id                 JWT — non-Published vidí jen autor nebo admin
POST   /                    JWT — multipart/form-data (file, title, description?, submit?)
PUT    /:id                 JWT autor — jen Draft nebo Rejected; body: { title?, description? }
DELETE /:id                 JWT — autor nebo admin; smaže jen DB záznam
POST   /:id/submit          JWT autor — Draft nebo Rejected → Pending
POST   /:id/approve         Admin — Pending → Published; nastaví publishedAtUtc
POST   /:id/reject          Admin — → Rejected; body: { reason?: string }
POST   /:id/rate            JWT — body: { stars: 1–5 }; autor nemůže hodnotit vlastní; vrátí { averageRating, totalRatings }
```

---

## 7. Notifikace (IkarosMessages)

| Akce | Příjemci | Subject | Body |
|---|---|---|---|
| submit | všichni Superadmin/Admin/PJ/SpravceClankuu/SpravceGalerie + username Tyky | „Obrázek ke schválení" | odkaz `/ikaros/galerie/:id` |
| approve | autor | „Obrázek schválen" | — |
| reject | autor | „Obrázek zamítnut" | rejectReason (pokud vyplněn) |

---

## 8. Modul

`backend/src/modules/ikaros-gallery/`
- `schemas/ikaros-gallery.schema.ts`
- `ikaros-gallery.controller.ts`
- `ikaros-gallery.service.ts`
- `ikaros-gallery.module.ts`
- `dto/create-gallery-item.dto.ts`
- `dto/update-gallery-item.dto.ts`
- `dto/rate-gallery-item.dto.ts`
- `dto/reject-gallery-item.dto.ts`
- `interfaces/ikaros-gallery-repository.interface.ts`
- `repositories/ikaros-gallery.repository.ts`
