# Krok 11a — IkarosNews — Design spec

**Datum:** 2026-05-04  
**Stav:** schváleno  
**Přístup:** samostatný modul, bez approval workflow

---

## 1. Cíl

Platformové novinky viditelné anonymním uživatelům. Jednoduchý CRUD bez schvalovacího toku.

---

## 2. Schema (`ikaros_news`)

```
title: string
content: string
authorId: string          (server-filled z JWT)
authorName: string        (server-filled z JWT)
createdAtUtc: Date        (server-filled)
isActive: boolean         (default true, server-filled)
```

Žádné drafty, žádné hodnocení, žádný approval workflow. `isActive` je jediný příznak viditelnosti.

---

## 3. API

Route prefix: `/IkarosNews` (bez `api/` prefixu — zachováno ze starého systému pro zpětnou kompatibilitu).

```
GET    /IkarosNews          AllowAnonymous — jen isActive=true, řazeno createdAtUtc DESC
POST   /IkarosNews          Superadmin/Admin/PJ — klient posílá jen title + content
DELETE /IkarosNews/:id      Superadmin/Admin/PJ — hard delete
```

- GET by ID endpoint neexistuje (konzistentní se starým systémem)
- Žádný soft delete

---

## 4. Modul

`backend/src/modules/ikaros-news/`
- `ikaros-news.schema.ts`
- `ikaros-news.controller.ts`
- `ikaros-news.service.ts`
- `ikaros-news.module.ts`
- `dto/create-ikaros-news.dto.ts`

---

## 5. Poznámky

- `authorId` a `authorName` vyplní controller z JWT — klient je neodesílá
- `createdAtUtc` a `isActive` vyplní controller — klient je neodesílá
- Žádné notifikace
