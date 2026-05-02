# Krok 5 — Presence & IkarosMessages — Design spec

**Datum:** 2026-05-02  
**Stav:** schváleno  
**Přístup:** EventEmitter2 loose coupling (Přístup B)

---

## 1. Presence

### Cíl
Jednoduchý REST endpoint vracející seznam online uživatelů na základě `lastSeenAt` timestampu.

### Poznámka k pojmenování
Roadmap používala `lastSeenUtc` — v kódu a DB je pole pojmenováno `lastSeenAt` (Date). Roadmap se přizpůsobuje kódu, pole se nepřejmenovává.

### Pole `isOnline`
`User.isOnline: boolean` zůstane v DB schématu (zpětná kompatibilita), ale Presence ho nikdy nenastavuje ani nečte. Jediná pravda je `lastSeenAt`.

### PresenceModule
- Závisí na globálním `UsersModule` (dostupný bez importu)
- `PresenceService.getOnlineUserIds()` — dotaz na Users kde `lastSeenAt >= now - threshold`
- Threshold: konstanta `PRESENCE_THRESHOLD_MS`, konfigurovatelná přes env `PRESENCE_THRESHOLD_HOURS` (fallback 25)

### Index
`User.lastSeenAt` musí mít MongoDB index (`@Prop({ index: true })`) — bez něj je presence query full collection scan.

### Endpoint
```
GET /api/presence/online   (JWT required)
→ string[]   // pole userIds
```

---

## 2. IkarosMessages

### Cíl
Interní inbox systém — přímé zprávy mezi uživateli + systémové akce (žádosti o vstup do světa).

### Schema (`ikarosmessages`)
```
senderId: string
senderName: string
recipientId: string
recipientName: string
subject: string          (max 200 znaků)
body: string             (max 5000 znaků)
sentAtUtc: Date          (index)
isRead: boolean          (default false)
deletedBySender: boolean (default false)
deletedByRecipient: boolean (default false)
actionType: '' | 'world_join_request'  (default '')
actionWorldId?: string
actionUserId?: string    // userId žadatele
actionResolved: boolean  (default false)
```

**Indexy:**
- `sentAtUtc` — řazení
- Composite `(recipientId, isRead)` — inbox a unread-count dotazy

### Endpointy
```
GET  /api/ikaros-messages/inbox
     ?limit=50&before=<messageId>    filtruje deletedByRecipient=false, stránkování cursor

GET  /api/ikaros-messages/sent
     ?limit=50&before=<messageId>    filtruje deletedBySender=false, stránkování cursor

GET  /api/ikaros-messages/unread-count
     → { messages: number, pendingRequests: number }
     messages = isRead=false, deletedByRecipient=false, actionType=''
     pendingRequests = actionResolved=false, deletedByRecipient=false, actionType='world_join_request'

GET  /api/ikaros-messages/:id        označí isRead=true, vrátí zprávu (jen vlastní)

POST /api/ikaros-messages            odeslání; senderId + senderName server-filled z JWT

DELETE /api/ikaros-messages/:id      soft delete pro aktuálního usera (sender nebo recipient)

POST /api/ikaros-messages/:id/resolve
     body: { accept: boolean, reason?: string }
     — ověří: volající je recipient, actionType='world_join_request', actionResolved=false
     — pokud membership již není Pending → 409 Conflict "Žádost již byla vyřízena"
     — accept=true  → membership Pending→Hrac + zpětná zpráva hráči "byl jsi přijat"
     — accept=false → zpětná zpráva s reason (prázdný reason → "byl jsi odmítnut")
     — nastaví actionResolved=true
```

### Resolve permissions
Každý PJ a PomocnyPJ světa dostane vlastní kopii `world_join_request` zprávy. První kdo zavolá `/resolve` zpracuje žádost. Ostatní při pokusu dostanou `409 Conflict`.

---

## 3. IkarosMessagesGateway

### Přístup
Gateway sdílí namespace `/` s ChatGateway. Při připojení se JWT ověří z handshake a socket se automaticky přidá do room `user:{userId}` — frontend nemusí nic volat (odolné vůči reconnectům).

### Events
```
server → client:
  ikaros:new-message  { messageId, subject, senderName, actionType }
  — emitováno na room user:{recipientId} při každé nové IkarosMessage
```

### EventEmitter2 flow
```
IkarosMessagesService.create()
  → eventEmitter.emit('ikaros.message.created', { recipientId, messageId, subject, senderName, actionType })

IkarosMessagesGateway
  → @OnEvent('ikaros.message.created')
  → this.server.to(`user:${recipientId}`).emit('ikaros:new-message', payload)
```

---

## 4. Worlds JOIN flow

### Idempotence
`WorldsService.join()` kontroluje existující membership:
- Pokud `existing` je `Pending` → vrátí existující, **event se neemituje** (žádost již odeslána)
- Pokud `existing` není Pending → ConflictException (již člen)
- Pokud neexistuje → vytvoř membership, pak emit

### Event pro private world
```
eventEmitter.emit('world.join.requested', {
  worldId: string,
  worldName: string,
  requesterId: string,
  requesterName: string,
})
```

### IkarosMessagesService listener
```typescript
@OnEvent('world.join.requested')
async handleJoinRequest(payload): Promise<void> {
  // Načte všechny PJ + PomocnyPJ světa z WorldMembershipRepository
  // Pro každého vytvoří IkarosMessage s actionType='world_join_request'
}
```

### Závislosti
- `WorldsModule` → nezná `IkarosMessagesModule` (žádný import)
- `IkarosMessagesModule` → importuje `WorldsModule` pro přístup k `IWorldMembershipRepository`
- `WorldsModule` musí exportovat `IWorldMembershipRepository` provider (přidat do `exports`)

---

## 5. Roadmap aktualizace
- `lastSeenUtc` přejmenovat na `lastSeenAt` v roadmap textu
- Krok 4 příznak `✅` potvrzen (viz roadmap stav tabulka)

---

## Moduly k vytvoření
- `PresenceModule` (presence.module.ts, presence.service.ts, presence.controller.ts)
- `IkarosMessagesModule` (schema, interface, repository + interface, service, controller, gateway)

## Moduly k úpravě
- `User.schema.ts` — přidat `index: true` na `lastSeenAt`
- `WorldsService.join()` — idempotence guard + podmíněný emit
- `AppModule` — registrace nových modulů
