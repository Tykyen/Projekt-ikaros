# Krok 13 — Push notifikace: Design spec

**Datum:** 2026-05-05  
**Status:** Schváleno

---

## Přehled

VAPID Web Push notifikace pro Ikaros. Uživatel jednou povolí notifikace v prohlížeči, systém mu pak posílá oznámení i když má aplikaci zavřenou. Nahrazuje funkci push notifikací ze starého systému.

**Scope notifikací:**
- Nová zpráva v globálním chatu
- Nová zpráva ve world chatu (dle přístupu ke kanálu)
- Nová IkarosNews (novinka)
- GameEvent — připomínka 24 hodin předem

---

## Architektura

Přístup: přímé volání `WebPushService` z každé service po vzniku události. Žádná fronta, žádné eventy — jednoduché a konzistentní s ostatními moduly.

### Nový modul

```
backend/src/modules/push/
  push.module.ts
  push.controller.ts
  push.service.ts
  schemas/
    push-subscription.schema.ts
  interfaces/
    push-subscription.interface.ts
    push-subscription-repository.interface.ts
  repositories/
    push-subscription.repository.ts
  dto/
    subscribe.dto.ts
```

---

## DB Schema: PushSubscription

Kolekce: `push_subscriptions`

| Pole | Typ | Popis |
|---|---|---|
| `userId` | string | index |
| `endpoint` | string | unique index |
| `p256dh` | string | šifrovací klíč |
| `auth` | string | autentizační klíč |
| `createdAt` | Date | |

Jeden uživatel může mít více subscriptions (různé prohlížeče/zařízení).

---

## Konfigurace (ENV)

```env
VAPID_PUBLIC_KEY=<base64url>
VAPID_PRIVATE_KEY=<base64url>
VAPID_SUBJECT=mailto:admin@ikaros.cz
```

Generování klíčů: `npx web-push generate-vapid-keys`

Knihovna: `web-push` (npm)

---

## REST API

### GET /api/push/vapid-public-key
- Anon (bez JWT)
- Vrátí `{ publicKey: string }`
- Frontend potřebuje public key pro vytvoření subscription v prohlížeči

### POST /api/push/subscribe
- JWT required
- Body: `{ endpoint: string, p256dh: string, auth: string }`
- Upsert dle `endpoint` (klíč) — pokud existuje, přepíše; jinak vytvoří
- `userId` se vyplní ze JWT

### POST /api/push/unsubscribe
- JWT required
- Body: `{ endpoint: string }`
- Smaže subscription dle `endpoint` pro daného usera

---

## WebPushService

```typescript
interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

// Odešle notifikaci všem subscriptions daného usera
notify(userId: string, payload: PushPayload): Promise<void>

// Odešle všem uživatelům (globální chat, news)
notifyAll(payload: PushPayload): Promise<void>
```

### Auto-cleanup subscriptions
Při odesílání: pokud push service vrátí **HTTP 404 nebo 410** (subscription expirovala nebo byla zrušena uživatelem), subscription se automaticky smaže z DB. Bez manuálního zásahu.

---

## Integrace

| Trigger | Service | Metoda | Příjemci |
|---|---|---|---|
| Nová zpráva — globální chat | `GlobalChatService` | `notifyAll` | všichni subscribers |
| Nová zpráva — world chat | `ChatService` | `notify` per user | subscribers s přístupem ke kanálu |
| Nová IkarosNews | `IkarosNewsService` | `notifyAll` | všichni subscribers |
| GameEvent 24h před začátkem | `GameEventReminderJob` | `notify` per user | members světa |

### Obsah notifikací

**Chat zpráva:**
```
title: "<jméno odesílatele>"
body:  "<náhled textu zprávy, max 100 znaků>"
```

**IkarosNews:**
```
title: "Nová novinka na Ikarosu"
body:  "<title novinky>"
```

**GameEvent připomínka:**
```
title: "Připomínka události"
body:  "<title eventu> — začíná za 24 hodin"
```

---

## GameEvent cron job: GameEventReminderJob

- Spouští se **každou hodinu**
- Najde GameEventy kde `date` je za **23–25 hodin** od teď
- Pro každý event: načte members světa → odešle push notifikaci každému
- Po odeslání: nastaví `reminderSent: true` na eventu → nezašle dvakrát
- GameEvent schema rozšíření: přidá pole `reminderSent: boolean` (default false)

---

## World chat — filtrování příjemců

`ChatService` po uložení zprávy do kanálu:
1. Zjistí typ kanálu a jeho access rules (participants, groupRequired, roleRequired)
2. Sestaví seznam `userIds` kteří mají k tomuto kanálu přístup (využije existující access logiku)
3. Pro každého: `webPushService.notify(userId, payload)`

PJ kanály → jen PJ/PomocnýPJ.  
Whisper → jen `visibleTo` list.  
Participants channel → jen participants.  
GroupRequired → jen členové skupiny.  
Veřejný kanál → všichni members světa.

**Odesílatel je vždy vyloučen** ze seznamu příjemců — nedostane push notifikaci své vlastní zprávy.

---

## Závislosti

- npm: `web-push`, `@types/web-push`
- Přidá se do `package.json` backendu

---

## Co se nemění

- Červené bubliny (unread count) fungují dál přes WebSocket — push notifikace jsou doplněk, ne náhrada.
- Frontend zodpovídá za: volání `GET /vapid-public-key`, registraci service workera, volání `POST /subscribe`.

---

## Testování

- Unit testy: `push.service.spec.ts` — mock `web-push`, ověří notify/notifyAll/auto-cleanup
- Integration: manuální test v prohlížeči (Chrome DevTools → Application → Push)
