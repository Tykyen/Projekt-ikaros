# Backend — přehled komponent

Dokumentace původního Matrix backendu (ASP.NET Core 8, MongoDB). Každý soubor popisuje jednu oblast — datové modely, API endpointy, logiku služby.

---

## Infrastruktura

| Soubor | Popis |
|--------|-------|
| [tech-stack.md](tech-stack.md) | NuGet závislosti, .NET 8, použité frameworky |
| [middleware-di.md](middleware-di.md) | Middleware pipeline, Dependency Injection, SignalR konfigurace, komprese |
| [mongodb-kolekce.md](mongodb-kolekce.md) | Všech 37 MongoDB kolekcí s popisem |
| [konfigurace-app.md](konfigurace-app.md) | JWT, VAPID, Search, RPG systémy, MatrixConstants |

---

## Autentifikace a uživatelé

| Soubor | Popis |
|--------|-------|
| [auth-jwt.md](auth-jwt.md) | Login flow, JWT claims, refresh token |
| [uzivatele.md](uzivatele.md) | User model, role (9 hodnot), API endpointy, veřejný vs. plný profil |

---

## Chat

| Soubor | Popis |
|--------|-------|
| [chat-skupiny.md](chat-skupiny.md) | ChatGroup model, seed výchozích skupin, API endpointy |
| [chat-kanaly.md](chat-kanaly.md) | ChatChannel model, přístupová logika CanUserAccessChannel, API endpointy |
| [chat-zpravy.md](chat-zpravy.md) | ChatMessage model, whisper, reakce, read status, push notifikace, API endpointy |
| [signalr-huby.md](signalr-huby.md) | ChatHub, MapHub, IkarosChatHub — real-time metody a eventy |

---

## Světy

| Soubor | Popis |
|--------|-------|
| [svety.md](svety.md) | World model, WorldSettings, membership, join logika, Matrix World seed |

---

## Mapy a prostory

| Soubor | Popis |
|--------|-------|
| [mapy.md](mapy.md) | MapScene, MapTemplate, tokeny, efekty, API endpointy, real-time integrace |

---

## Postavy a vesmír

| Soubor | Popis |
|--------|-------|
| [postavy-npc-vesmir.md](postavy-npc-vesmir.md) | Character model, NPC šablony, UniverseMap s filtrem viditelnosti |

---

## Kampaně

| Soubor | Popis |
|--------|-------|
| [kampane.md](kampane.md) | 6 campaign modelů (Subject, Relationship, Storyline, Scenario, QuickNote, ShopItem), 29 endpointů, PJ logika |

---

## Herní čas a eventy

| Soubor | Popis |
|--------|-------|
| [eventy-kalendar-timeline.md](eventy-kalendar-timeline.md) | GameEvent + RSVP, cleanup service, Calender, Timeline |

---

## Ikaros modul

| Soubor | Popis |
|--------|-------|
| [ikaros-obsah.md](ikaros-obsah.md) | Články (schvalovací tok), diskuse, galerie (Google Drive), news |
| [ikaros-chat.md](ikaros-chat.md) | IkarosMessage, ActionType (world_join_request...), IkarosChatHub, notifikační tok |

---

## Vyhledávání

| Soubor | Popis |
|--------|-------|
| [vyhledavani-lucene.md](vyhledavani-lucene.md) | Fulltextové vyhledávání — RAMDirectory, český analyzátor, váhy polí, SearchCoordinator |
| [vyhledavani-embedding.md](vyhledavani-embedding.md) | AI sémantické vyhledávání — ONNX, chunking, VP-Tree, fronta indexace |

---

## Média a soubory

| Soubor | Popis |
|--------|-------|
| [push-media.md](push-media.md) | Push notifikace (VAPID), Google Drive integrace, upload obrázků, zvuky |

---

## Obsah

| Soubor | Popis |
|--------|-------|
| [stranky.md](stranky.md) | Page model, accessRequirements, TipTap extrakce, seed šablony pro nové světy |
| [news.md](news.md) | NewsItem model, compound index, API endpointy |

---

## Ostatní

| Soubor | Popis |
|--------|-------|
| [presence-stats.md](presence-stats.md) | Presence heartbeat (LastSeenUtc), Stats a rebuild indexu |
| [emotes.md](emotes.md) | CustomEmote, per-world izolace, Google Drive ImageId |
