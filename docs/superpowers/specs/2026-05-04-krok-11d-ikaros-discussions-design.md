# Krok 11d — IkarosDiscussions — Design spec

**Datum:** 2026-05-04  
**Stav:** schváleno  
**Přístup:** samostatný modul, schvalování, manažeři, pozvání, oblíbené na User schema

---

## 1. Cíl

Diskuzní fórum s workflow schvalování, rolemi manažerů, systémem pozvánek pro uzavřené diskuze a oblíbenými.

---

## 2. Schémata

### `ikaros_discussions`

```
title: string
description: string
bulletin: string               (editovatelná nástěnka; default "")
creatorId: string
creatorName: string
isApproved: boolean            (default false)
isOpen: boolean                (default true)
managerIds: string[]           (creatorId auto-přidán při POST)
invitedUserIds: string[]       (default [])
postCount: number              (default 0)
likeCount: number              (default 0; připraveno, endpoint není implementován)
createdAtUtc: Date
lastActivityUtc: Date
```

### `ikaros_discussion_posts` (samostatná kolekce)

```
discussionId: string
authorId: string
authorName: string
content: string
createdAtUtc: Date
```

### Indexy
- `discussions: (isApproved, isOpen)` — filtrování seznamu
- `posts: (discussionId, createdAtUtc ASC)` — stránkování příspěvků

---

## 3. User schema rozšíření

Přidat pole `favoriteDiscussionIds: string[]` (default `[]`) na `User` schema.

---

## 4. Kdo je „admin"

Role: `Superadmin | Admin | PJ | SpravceDisukzi` nebo `username === "Tyky"`.

---

## 5. Přístupová logika

**GET / (seznam):**
- Admin vidí vše
- Ostatní vidí jen `isApproved=true` AND (`isOpen=true` OR userId v `invitedUserIds` OR userId v `managerIds` OR userId === `creatorId`)

**GET /:id:**
- Uzavřená diskuze (`isOpen=false`) → 403 pokud uživatel není v `invitedUserIds`, `managerIds`, není `creatorId` ani admin

---

## 6. Workflow

- Admin vytvoří diskuzi → `isApproved=true` automaticky (bez notifikace)
- Non-admin vytvoří diskuzi → `isApproved=false`; notifikace adminům
- `reject` = hard delete diskuze + všech příspěvků; notifikace tvůrci

---

## 7. API (`/api/ikaros-discussions`)

```
GET    /                        JWT — filtrováno dle přístupu (viz sekce 5)
GET    /pending                 Admin — isApproved=false
GET    /my-favorites            JWT — diskuze dle User.favoriteDiscussionIds
GET    /:id                     JWT — 403 pro uzavřené bez přístupu
POST   /                        JWT — admin → isApproved=true; non-admin → isApproved=false + notifikace
PATCH  /:id                     Manager nebo Admin — body: { title?, description?, bulletin?, isOpen? }
POST   /:id/approve             Admin — isApproved=true; notifikace tvůrci
POST   /:id/reject              Admin — body: { reason?: string }; hard delete diskuze + příspěvků; notifikace tvůrci
POST   /:id/invite              Manager nebo Admin — body: { userId }; přidá do invitedUserIds; notifikace pozvanému
POST   /:id/toggle-favorite     JWT — přepne userId v User.favoriteDiscussionIds; vrátí { isFavorite: bool }
GET    /:id/posts               JWT — query: skip (default 0), limit (default 50); řazeno createdAtUtc ASC
POST   /:id/posts               JWT — diskuze musí být isApproved=true; aktualizuje postCount + lastActivityUtc
DELETE /:id/posts/:postId       JWT — autor příspěvku nebo manager nebo admin; dekrementuje postCount
```

---

## 8. Notifikace (IkarosMessages)

| Akce | Příjemci | Subject | Body |
|---|---|---|---|
| POST (non-admin) | všichni Superadmin/Admin/PJ/SpravceDisukzi + username Tyky | „Nová diskuze čeká na schválení" | odkaz na diskuzi |
| approve | tvůrce | „Vaše diskuze byla schválena" | — |
| reject | tvůrce | „Vaše diskuze byla zamítnuta" | reason (pokud vyplněn) |
| invite | pozvaný uživatel | „Byl/a jsi pozván/a do diskuze" | odkaz na diskuzi |

---

## 9. Modul

`backend/src/modules/ikaros-discussions/`
- `schemas/ikaros-discussion.schema.ts`
- `schemas/ikaros-discussion-post.schema.ts`
- `ikaros-discussions.controller.ts`
- `ikaros-discussions.service.ts`
- `ikaros-discussions.module.ts`
- `dto/create-discussion.dto.ts`
- `dto/patch-discussion.dto.ts`
- `dto/reject-discussion.dto.ts`
- `dto/invite-user.dto.ts`
- `dto/add-post.dto.ts`
- `interfaces/ikaros-discussions-repository.interface.ts`
- `interfaces/ikaros-discussion-posts-repository.interface.ts`
- `repositories/ikaros-discussions.repository.ts`
- `repositories/ikaros-discussion-posts.repository.ts`
