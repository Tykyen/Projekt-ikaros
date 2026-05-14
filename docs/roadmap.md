# Projekt Ikaros — Vývojová linka

Centrální přehled všech kroků. Každý krok má vlastní spec + plán v `docs/superpowers/`.  
Vychází z analýzy starého systému (`C:\Matrix\Matrix`) + `docs/old/`.

**Stav:** `✅ hotovo` | `🚧 probíhá` | `⬜ plánováno`

> **Zásada:** Nový systém musí pokrýt vše, co zvládal starý. Tam kde starý používal Google Drive → **Cloudinary**. Tam kde starý používal SignalR → **NestJS Gateway (Socket.io)**. Tam kde starý používal Lucene → **MeiliSearch nebo MongoDB Atlas Search**.

> ⚠️ **Audit 2026-05-05:** tento dokument byl historicky příliš optimistický. Reálný stav, chybějící moduly a opravný plán jsou v [roadmap2.md](roadmap2.md). Stavy níže byly opraveny dle auditu — kroky označené `🚧` mají v sekci `> AUDIT:` poznámku, co konkrétně chybí.

---

## Krok 1 — Základ & Auth ✅

> AUDIT (po fázi 1.1 + 1.3): `akj` claim ze starého systému se nepřidává — AKJ je per-world. `POST /auth/refresh` implementován s rotací + blacklist (familyId), reuse detection. Navíc `POST /auth/logout` (per-session) a `POST /auth/logout-all` (per-user). Změna hesla revokuje všechny refresh tokeny (EventEmitter `user.password.changed`).

- [x] Auth modul: POST /api/auth/login (bcrypt verify → JWT)
- [x] **POST /api/auth/refresh** — rotace + blacklist (familyId), reuse detection (revoke rodiny při zneužití)
- [x] **POST /api/auth/logout** — per-session, idempotent
- [x] **POST /api/auth/logout-all** — per-user, vyžaduje JWT
- [x] JWT claims: sub (userId), email, username, role, characterPath, ikarosSkin _(akj záměrně NE — AKJ je per-world)_
- [x] JWT 24h expiry, HS256, guard `JwtAuthGuard`, decorator `@CurrentUser()`
- [x] Users modul: CRUD, 9 rolí (User/Player/PJ/Korektor/SpravceXxx/Admin/Superadmin)
- [x] User schema: passwordHash, profileImageUrl, groups, themeSettings, chatPreferences, characterPath
- [x] Worlds modul základ: World CRUD (name, slug, description, genre, accessMode)
- [x] DB seed: Matrix world, první PJ vlastník

**Plán:** [docs/superpowers/plans/2026-05-01-krok-1-zaklad.md](superpowers/plans/2026-05-01-krok-1-zaklad.md)

---

## Krok 2 — Světy ✅

> AUDIT (po fázi 4): původní audit minul implementaci. JOIN flow JE hotový: `POST /worlds/:id/join` v `worlds.controller.ts:103`, větvení dle accessMode v `worlds.service.ts:107-142` (closed → 403, public → Hrac, private → Pending), idempotence, emit `world.join.requested` → `@OnEvent` listener v `ikaros-messages.service.ts:152` vytvoří IkarosMessage PJ. Spec testy v `worlds.service.spec.ts:118-130`.

- [x] WorldMembership: userId, worldId, role (Pending/Hrac/Korektor/PomocnyPJ/PJ), avatarUrl, characterPath, group, akj
- [x] JOIN logika: kontrola accessMode → vytvoř Pending nebo Hrac, odešli IkarosMessage vlastníkovi (na krok 5)
- [x] World settings: hiddenNavItems, customGroups, groupColors, currencies (seed dle genre)
- [x] WorldCalendarConfig struktura: daysOfWeek, months (s daysCount), celestialBodies
- [x] Worlds controller: GET all, GET /my, POST, PATCH metadata, GET+PUT /settings, /calendarconfig, /members

**Plán:** [docs/superpowers/plans/2026-05-01-krok-2-svety.md](superpowers/plans/2026-05-01-krok-2-svety.md)

---

## Krok 3 — Chat & Upload ✅

> AUDIT (po fázi 16b): `customFont`, `color`, `isDiceRoll` doplněny do `ChatMessage` ([chat-message.schema.ts:27,42,46](../backend/src/modules/chat/schemas/chat-message.schema.ts#L27)); `type` na `ChatChannel` ([chat-channel.schema.ts:18](../backend/src/modules/chat/schemas/chat-channel.schema.ts#L18)).

### 3a — Chat core ✅
- [x] **ChatChannel.type** (team_ic/ooc/pj/dm/...) — schema field
- [x] **ChatMessage.customFont** + **color** + **isDiceRoll**
- [x] Soft-delete vrací `'*Zpráva byla smazána autorem*'`
- [x] Blokování smazání kostek (`isDiceRoll` guard)
- [x] Editace příloh (`attachmentsToAdd` / `attachmentsToRemove` v UpdateMessageDto)

- [x] ChatGroup schema: id, worldId, name, icon, background, color, order, access
- [x] Seed: 6 Matrix skupin (Globální, Evropani, Lumíci, MI6, Komunikace Hráči, Komunikace s PJ)
- [x] ChatChannel typy: team_ic/ooc/pj, dm, pj_dm/group, inter
- [x] Channel access: PJ always; RoleRequired, GroupRequired, Participants checks; isDeleted filter
- [x] ChatMessage: content, senderId, senderName, isEdited, isDeleted, reactions, replyToId/Preview, visibleTo, rpDate, overrideName/AvatarUrl
- [x] Soft delete: vlastní → "zpráva smazána"; PJ → hard delete
- [x] ChannelReadStatus: upsert lastReadUtc per user×channel
- [x] ChatGateway (WebSocket): JoinChannel, LeaveChannel, Typing → UserTyping
- [x] ChatController: GET channels (s unread+lastMsg), POST/PUT/DELETE, GET messages (cursor), POST /read/:channelId, POST /:id/react

### 3b — Chat extensions ✅
- [x] Reactions: toggleReaction (emoji × userId mapa)
- [x] Whisper: visibleTo list (server auto-přidá senderId), filtrováno pro non-PJ
- [x] Reply: replyToId, replyToPreview, replyToSenderName
- [x] Read status: markAsRead, getUnreadCounts (batch agregace)

### 3c — Global chat + Upload ✅
- [x] GlobalChatModule: "Matrix hospoda" — interdimenzionální kanál
- [x] GlobalChatGateway: presence events, broadcast zpráv
- [x] GlobalChatController: GET/POST/DELETE /api/global-chat/messages
- [x] IkarosChatHub 5 pokojů: hospoda, pokec, rozcesti 1–3 (in-memory, história 60 min)
- [x] UploadModule: Cloudinary, multer, MIME validace (image/video/document)
- [x] ChatAttachment interface + schema + cleanup při smazání zprávy (EventEmitter)
- [x] POST /api/upload endpoint (multipart, max 50 MB)

**Plány:**
- [docs/superpowers/plans/2026-05-01-krok-3a-chat-core.md](superpowers/plans/2026-05-01-krok-3a-chat-core.md)
- [docs/superpowers/plans/2026-05-02-krok-3b-chat-extensions.md](superpowers/plans/2026-05-02-krok-3b-chat-extensions.md)
- [docs/superpowers/plans/2026-05-02-krok-3c-crossworld.md](superpowers/plans/2026-05-02-krok-3c-crossworld.md)
- [docs/superpowers/plans/2026-05-02-krok-3c-upload.md](superpowers/plans/2026-05-02-krok-3c-upload.md)

---

## Krok 4 — Users rozšíření ✅

> Dokončení user modelu — vše bez závislosti na Pages nebo jiných pozdějších modulech.

- [x] ~~**AKJ flag**~~ _(zrušeno 2026-05-05 — AKJ je per-world přes `WorldMembership.akj`, ne globální per-user)_
- [x] **ThemeSettings**: volný JSON blob `Record<string, unknown>` na user schema
- [x] **ChatPreferences**: volný JSON blob `Record<string, unknown>` na user schema
- [x] **LastSeenAt v JwtAuthGuard**: fire-and-forget `updateLastSeen` při každém úspěšném JWT; `isOnline` se nenastavuje (řeší Krok 5 Presence)
- [x] **PublicUser interface + GET /api/users/profile/:id**: veřejný subset (id, username, displayName, avatarUrl, characterPath, role, createdAt), bez JWT
- [x] **JWT claims rozšíření**: sub, email, username, role, characterPath, ikarosSkin _(akj záměrně NE)_
- [x] **Merge logika v PATCH**: `themeSettings` a `chatPreferences` deep-merge, ostatní přímé přepsání; `username` jen Superadmin
- [x] **PUT /api/users/password**: vlastní změna hesla (bcrypt verify + hash)
- [x] **PUT /api/users/:id/reset-password**: Superadmin reset bez ověření starého hesla
- [x] **DELETE /api/users/:id**: vlastní účet nebo Admin+; 204 No Content
- [x] **UsersModule @Global()**: `IUsersRepository` dostupné globálně

**Spec:** [docs/superpowers/specs/2026-05-02-krok-4-users-rozsireni-design.md](superpowers/specs/2026-05-02-krok-4-users-rozsireni-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-02-krok-4-users-rozsireni.md](superpowers/plans/2026-05-02-krok-4-users-rozsireni.md)

---

## Krok 5 — Presence & IkarosMessages ✅

> Online heartbeat + interní zprávy (inbox, pozvánky, žádosti o vstup do světa).

### Presence
- [x] `User.lastSeenAt` — update při každém JWT requestu (již implementováno v Kroku 4); index na `lastSeenAt`
- [x] GET /api/presence/online → vrátí `string[]` (userIds online za posledních 25h)
- [x] Presence threshold konfigurovatelný přes env `PRESENCE_THRESHOLD_HOURS` (výchozí 25h)

### IkarosMessage (přímé zprávy + systémové akce)
- [x] Schema: senderId, senderName, recipientId, recipientName, subject, body, sentAtUtc, isRead, deletedBySender, deletedByRecipient, actionType, actionWorldId, actionUserId, actionResolved
- [x] `actionType`: `""` (normální) | `"world_join_request"` (žádost o vstup do světa)
- [x] Soft-delete: každá strana může nezávisle smazat svoji kopii
- [x] GET /api/ikaros-messages/inbox (filtruje deletedByRecipient)
- [x] GET /api/ikaros-messages/sent (filtruje deletedBySender)
- [x] GET /api/ikaros-messages/unread-count → `{ messages: number, pendingRequests: number }`
- [x] GET /api/ikaros-messages/:id (označí isRead=true)
- [x] POST /api/ikaros-messages (odeslání)
- [x] DELETE /api/ikaros-messages/:id (soft delete pro aktuálního usera)
- [x] POST /api/ikaros-messages/:id/resolve `{ accept: bool }` — pro world_join_request: Pending→Hrac + zpráva zpět hráči

### Worlds JOIN flow (navazuje na krok 2)
- [x] Při JOIN do světa s accessMode=private/closed: vytvoř IkarosMessage s actionType=world_join_request vlastníkovi
- [x] PJ zavolá /resolve → přijme nebo odmítne → membership update

**Spec:** [docs/superpowers/specs/2026-05-02-krok-5-presence-ikaros-messages-design.md](superpowers/specs/2026-05-02-krok-5-presence-ikaros-messages-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-02-krok-5-presence-ikaros-messages.md](superpowers/plans/2026-05-02-krok-5-presence-ikaros-messages.md)

---

## Krok 6 — Pages (Wiki) ✅

> Stránky světa s TipTap JSON obsahem, access control, slugy, search integrace.

- [x] **Page schema**: slug, worldId, type, title, content, imageUrl, bigImage, accessRequirements, order, isWoodWide, createdAt _(obsah jako string místo TipTap JSON paragraphs)_
- [x] **AccessRequirement**: type (AKJ/AKJType/UserId/Role) + value; hierarchie: PJ/Admin vždy; Korektor≥Player≥User
- [ ] **TipTapExtractor**: _(přeskočeno — content je string, ne TipTap JSON)_
- [ ] **MatrixWorldFilter**: _(přeskočeno — k Kroku 7)_
- [x] Seed při vytvoření světa: 5 šablon stránek (pravidla, magicky-system, technologie, faq, videa)
- [x] GET /api/worlds/:worldId/pages (s access filtrem)
- [x] GET /api/worlds/:worldId/pages/directory
- [x] GET /api/worlds/:worldId/pages/:slug
- [x] GET /api/worlds/:worldId/pages/meta/:slug
- [x] GET /api/worlds/:worldId/pages/data?number=N, GET /api/worlds/:worldId/pages/dataSlugs
- [x] POST, PUT, DELETE /api/worlds/:worldId/pages
- [x] **FavoritePages** _(world-scoped místo user-scoped: pole na World schema; POST/DELETE /api/worlds/:worldId/pages/:slug/favorite, GET /api/worlds/:worldId/favorites)_
- [x] **PopulateProfileImages** _(z character.imageUrl místo Page.imageUrl — OnEvent character.created/updated + bootstrap backfill)_
- [x] **AKJType v WorldSettings**: akjTypes[], menuTemplates[] — seed pro Matrix world
- [x] **Characters** _(základní schema; plný RPG model přesunut na Krok 7)_

**Spec:** [docs/superpowers/specs/2026-05-02-krok-6a-pages-design.md](superpowers/specs/2026-05-02-krok-6a-pages-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-02-krok-6a-pages.md](superpowers/plans/2026-05-02-krok-6a-pages.md)

---

## Krok 7a — Characters RPG rozšíření ✅

> Rozšíření existujícího Character modelu o systém deníků (diaryData + extraBlocks), world diary template (diarySchema na WorldSettings) a nové endpointy /players + /directory.

- [x] **SchemaBlock** interface (key, label, type, config, order) — volný JSON, backend jen ukládá
- [x] **WorldSettings.diarySchema**: SchemaBlock[] — world template pro deníky postav
- [x] **Character.diaryData**: Record<string, unknown> — hodnoty bloků, merge při PATCH
- [x] **Character.extraBlocks**: SchemaBlock[] — additivní bloky specifické pro postavu, replace při PATCH
- [x] **getPlayerCharacters**: filtruje isNpc=false + userId set
- [x] GET /api/worlds/:worldId/characters/players (JWT required)
- [x] GET /api/worlds/:worldId/characters/directory (veřejný, bez JWT)

**Spec:** [docs/superpowers/specs/2026-05-02-krok-7a-characters-design.md](superpowers/specs/2026-05-02-krok-7a-characters-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-02-krok-7a-characters.md](superpowers/plans/2026-05-02-krok-7a-characters.md)

---

## Krok 7b — NPC Templates ✅

> Znovupoužitelné šablony NPC pro PJ — stats, schopnosti, poznámky.

- [x] **NpcTemplate schema**: name, imageUrl, abilities (TagValue), maxHp, armor, injury, notes, diarySchema, diaryData
- [x] GET /api/worlds/:worldId/npc-templates, GET /:id, POST, PUT /:id, DELETE (PJ/Admin+ pro mutace)

**Spec:** [docs/superpowers/specs/2026-05-02-krok-7b-npc-templates-design.md](superpowers/specs/2026-05-02-krok-7b-npc-templates-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-02-krok-7b-npc-templates.md](superpowers/plans/2026-05-02-krok-7b-npc-templates.md)

---

## Krok 7c — Universe Map ✅

> AUDIT (po fázi 4): visibility filter ověřen — `isPublic`/`visibleToPlayerIds` na DTO + repository + 3 spec testy v `universe.service.spec.ts:65-100` (hráč vidí jen public + own visibility, anon jen public).

> 3D vesmírná mapa světa — uzly, spoje, postupné odhalování, real-time sync, legacy seed pro Matrix.

- [x] **UniverseMap schema**: worldId, nodes (id/name/type/color/size/img/alliance/x/y/z/isPublic/visibleToPlayerIds), links (source/target/isOrbit)
- [x] Node typy: planet/star/nebula/asteroid/moon/blackhole
- [x] Visibility filter: PJ/Admin vidí vše; hráči vidí isPublic=true NEBO v visibleToPlayerIds; links filtrovat aby neodhalily skryté uzly
- [x] Lazy init: Matrix world → seed (40 uzlů, 81 spojení); ostatní světy → prázdná mapa
- [x] GET /api/universe?worldId=:id, PUT (full replace), PATCH /:worldId/nodes/:nodeId/visibility
- [x] Real-time: universe:updated event přes world:{worldId} room

**Spec:** [docs/superpowers/specs/2026-05-02-krok-7c-universe-map-design.md](superpowers/specs/2026-05-02-krok-7c-universe-map-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-02-krok-7c-universe-map.md](superpowers/plans/2026-05-02-krok-7c-universe-map.md)

---

## Krok 7d — RPG System Presets ✅

> AUDIT (aktualizováno 2026-05-07): modul [system-presets/](../backend/src/modules/system-presets/) implementován s 13 statickými presety, controller + service, integrace `SystemPresetsService` ve [worlds.service.ts:51](../backend/src/modules/worlds/worlds.service.ts#L51) (auto-seed `diarySchema` při POST /worlds dle `world.system`).

> Konfigurace CharacterSheet šablon per RPG systém; auto-seed WorldSettings.diarySchema při vytvoření/změně světa; verzování schémat.

- [x] Podporované systémy: **D&D 5e**, **D&D 2e**, **D&D 3+**, **DrD Hero**, **DrD 16** (sub-moduly: Alchemy/Ranger/Thief/Warrior/Wizard), **GURPS**, **Call of Cthulhu**, **Fate**, **Shadowrun**, **Jad**, **Pi**, **Matrix custom**
- [x] Presety jako statické TS soubory (`src/modules/system-presets/presets/`), jeden per systém
- [x] Auto-seed `WorldSettings.diarySchema` při POST /api/worlds dle `world.system`
- [x] Při změně `world.system`: archivace staré diarySchema → `DiarySchemaVersion` kolekce → seed nové z presetu
- [x] GET /api/system-presets, GET /api/system-presets/:system
- [x] GET /api/worlds/:worldId/diary-schema-versions, GET .../diary-schema-versions/:version

**Spec:** [docs/superpowers/specs/2026-05-03-krok-7d-rpg-system-presets-design.md](superpowers/specs/2026-05-03-krok-7d-rpg-system-presets-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-03-krok-7d-rpg-system-presets.md](superpowers/plans/2026-05-03-krok-7d-rpg-system-presets.md)

---

## Krok 8a — Taktická mapa ✅

> Hex-based mapy, tokeny, fog of war, efekty, šablony, real-time sync. Tokeny jako bojový snapshot z character deníků. Dvouúrovňový NPC bestiář (globální + per-world).

- [x] **MapScene schema**: worldId, name, imageUrl, folder, config (HexConfig), tokens (MapToken[]), npcTemplates (MapSceneNpc[]), effects (MapEffect[]), fogEnabled, revealedHexes, templateId, isActive, isHidden, isLocked, activeSoundIds, lastModified
- [x] **MapToken**: characterId/slug, q/r (hex coords), isNpc, templateId, instanceName, currentHp/maxHp/baseHp, armor/baseArmor, injury, initiative/initiativeBase, inCombat, movement, abilities, personalDiarySchema, customData; `characterData` enrichment při GET
- [x] **MapSceneNpc**: lokální embedded kopie NPC šablony (originTemplateId, abilities jako label/value)
- [x] **MapEffect**: id, type, hexes, color, rings (radius+damage), variant, excludedHexes, barrierDC
- [x] **MapTemplate**: znovupoužitelné scény bez worldId/isActive/isHidden/isLocked
- [x] SetActive: deaktivuje ostatní scény světa (max 1 aktivní per world)
- [x] MoveToken/RemoveToken: hráči jen svůj token, PJ cokoliv
- [x] GET /api/maps, /active, /:id (s characterData enrichment)
- [x] POST, POST /:id/active, PUT /:id, PATCH move-token/remove-token, DELETE
- [x] GET/POST/PUT/DELETE /api/map-templates
- [x] **MapsGateway**: 13 Socket.io eventů (token, config, fog, dice, ping, sound, effects, scene state)
- [x] `map:dice-rolled` → broadcast všem včetně odesílatele
- [x] **NpcTemplates rozšíření**: nullable worldId (null = globální bestiář), movement, initiativeBase, GET /global, POST /:id/import
- [x] **User.themeSettings.dicePreferences**: per-dice-type skin persistence (bez nového API)

**Spec:** [docs/superpowers/specs/2026-05-03-krok-8a-tactical-map-design.md](superpowers/specs/2026-05-03-krok-8a-tactical-map-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-03-krok-8a-tactical-map.md](superpowers/plans/2026-05-03-krok-8a-tactical-map.md)

---

## Krok 8b — Dungeon Builder ✅

> Backend podpora pro tile-based dungeon editor. PJ ukládá rozpracované dungeony a exportuje je jako MapTemplate nebo MapScene.

- [x] DungeonMap kolekce: worldId, gridType (square/hex), cells[][], decorations[], theme (dyson/modern)
- [x] CRUD API: GET/POST/PUT/DELETE /api/dungeon-maps (PJ+)
- [x] Export jako MapTemplate: POST /api/dungeon-maps/:id/export-template
- [x] Export jako MapScene: POST /api/dungeon-maps/:id/export-scene (vždy použije dungeon.worldId)

**Spec:** [docs/superpowers/specs/2026-05-04-krok-8b-dungeon-builder-design.md](superpowers/specs/2026-05-04-krok-8b-dungeon-builder-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-8b-dungeon-builder.md](superpowers/plans/2026-05-04-krok-8b-dungeon-builder.md)

---

## Krok 9 — Kampaně ✅

> 6 modelů pro GM nástroje — pavučina vztahů, příběhové linky, scénáře.

### CampaignSubject (uzly pavučiny)
- [x] Schema: ownerId, worldId, type (PC/NPC/LOCATION/ORG/FACTION), name, avatarUrl, tags, status (active/archived), linkedPageSlug, linkedCharacterSlug, notes, isShared
- [x] PJ vidí vše; PomocnýPJ vidí vlastní + sdílené; Hráč vidí jen vlastní

### CampaignRelationship
- [x] Schema: ownerId, worldId, subjectAId, subjectBId
- [x] Sdílená vrstva: whatHappened, behindTheScenes
- [x] Perspektivy SideA/SideB: tone, behavior, gmIntent, strength (1–10)
- [x] status: active/dormant/crisis/closed, priority (1–5), storylineIds, lastChangeNote

### CampaignStoryline
- [x] Schema: ownerId, worldId, level (macro/mid/micro), title, status (active/dormant/escalating/climax/closed)
- [x] phase, summary, whatHappened, truth (GM-only), playersBelief, gmIntent
- [x] nextStep (zobrazuje se na dashboardu), subjectIds, relationshipIds

### CampaignScenario
- [x] Schema: ownerId, worldId, title, contentData (TipTap JSON), order (max+1 per scope), linkedPageSlug, subjectIds, storylineIds, images (gallery URLs)

### CampaignQuickNote
- [x] Schema: ownerId, worldId, title, body, status (open/done), pinned, subjectIds, storylineIds

### CampaignShopItem
- [x] Schema: ownerId, worldId, name, description, group/subgroup, price, currencyCode, linkedItemIds (cross-reference), referenceLink, isRecommended
- [x] Kaskádové mazání: deleteItem → pull z linkedItemIds ostatních

### CampaignChangeLog
- [x] Auditní log s TTL 90 dní + max 200 záznamů per world; PJ vidí vše, PomocnýPJ jen sdílené

### Dashboard endpoint
- [x] GET /api/campaign/dashboard → crisisRelationships, activeStorylines, pinnedNotes, recentChanges (max 20)

### REST API (33 endpointů)
- [x] Všechny modely: GET (s filtry), GET /:id, POST, PUT /:id, DELETE
- [x] Speciální: GET /players, GET /dashboard, GET /changelog
- [x] resolveScope dle WorldRole (Hráč/PomocnýPJ/PJ)

**Spec:** [docs/superpowers/specs/2026-05-03-krok-9-kampane-design.md](superpowers/specs/2026-05-03-krok-9-kampane-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-03-krok-9-kampane.md](superpowers/plans/2026-05-03-krok-9-kampane.md)

---

## Krok 10a — GameEvent ✅

> AUDIT (aktualizováno 2026-05-07): controller + service plně implementovány, [game-events.controller.ts](../backend/src/modules/game-events/game-events.controller.ts) má 10 endpointů (CRUD + confirm + comments CRUD + react). Schema doplněno o `confirmable`, `confirmedBy`, `comments`, `reactions`, `groupOnly`, `imageUrl`.

> Herní události světa s RSVP potvrzením, skupinovou viditelností, diskusí a automatickým mazáním starých.

- [x] Schema: worldId, title, date (ISO string, sort key), targetGroup, groupOnly, imageUrl, description, confirmable (RSVP toggle), confirmedBy (EventConfirmation: userId/userName), comments (EventComment[])
- [x] EventComment: id (UUID), parentId, authorId, authorName, content, createdAt, editedAt, reactions (emoji→userId[]), isDeleted (soft delete)
- [x] Viditelnost: targetGroup + groupOnly flag — groupOnly=true omezí komentáře i zobrazení na danou skupinu + PJ/PomocnýPJ
- [x] Index: (worldId, date)
- [x] GET /api/game-events (filtry: worldId/limit/fromDate), POST, PUT (zachová confirmedBy pokud incoming null), DELETE
- [x] POST /api/game-events/:id/confirm (toggle účasti)
- [x] POST /api/game-events/:id/comments, PATCH /:id/comments/:commentId, DELETE /:id/comments/:commentId
- [x] POST /api/game-events/:id/comments/:commentId/react (emoji toggle)
- [x] **GameEventCleanupService**: cron job (každou hodinu), smaže eventy starší než 24h

**Spec:** [docs/superpowers/specs/2026-05-04-krok-10a-game-event-design.md](superpowers/specs/2026-05-04-krok-10a-game-event-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-10a-game-event.md](superpowers/plans/2026-05-04-krok-10a-game-event.md)

---

## Krok 10b — Calendar ✅

> AUDIT (aktualizováno 2026-05-07): standalone modul [calendars/](../backend/src/modules/calendars/) (controller + legacy-calenders pro zpětnou kompatibilitu).

> Per-postava herní deník — osobní kalendář událostí.

- [x] Schema: worldId, slug (key = characterSlug), events (CalendarEvent: id/title/description/start/end/hourStart/hourEnd/allDay)
- [x] PUT: nahradí celé Events; auto-create pokud chybí; fixWorldId pokud neshoda
- [x] GET /api/calenders/:slug, PUT
- [x] color + displaySettings (PJ nastavení vzhledu)
- [x] Agregovaný PJ pohled GET /worlds/:worldId/calendars/aggregate
- [x] isLocation flag na Character

**Spec:** `docs/superpowers/specs/2026-05-04-krok-10b-calendar-design.md`  
**Plán:** `docs/superpowers/plans/2026-05-04-krok-10b-calendar.md`

---

## Krok 10c — TimelineEvent ✅

> AUDIT (aktualizováno 2026-05-07): standalone modul [timeline/](../backend/src/modules/timeline/) implementován (schema, repositories, controller, service, spec).

> Historická časová osa světa s fantasy datumovými formáty.

- [x] Schema: worldId, year/month/day (1-based číselné indexy), text, imageUrl, link, celestialOverrides
- [x] Base64 stripping: GET /api/timeline stripuje data: URI; GET /:id zachová; PUT zachová base64 pokud incoming null
- [x] GET, POST, PUT, DELETE
- [x] celestialStates vypočteny za běhu z WorldCalendarConfig (nejsou v DB)

**Spec:** `docs/superpowers/specs/2026-05-04-krok-10cd-timeline-calendar-config-design.md`  
**Plán:** `docs/superpowers/plans/2026-05-04-krok-10cd-timeline-calendar-config.md`

---

## Krok 10d — WorldCalendarConfig ✅

> AUDIT (aktualizováno 2026-05-07): standalone modul [world-calendar-config/](../backend/src/modules/world-calendar-config/) (samostatná kolekce, schema, repository, controller, service, utils).

> Konfigurace fantasy kalendáře světa (dny, měsíce, nebeská tělesa).

- [x] daysOfWeek, months (s daysCount), hoursPerDay, celestialBodies (moon/sun/planet/comet/other)
- [x] Výpočet stavů nebeských těles: cyklická matematika s referenceDate a referenceOffset
- [x] Samostatná kolekce `world_calendar_configs`, 1:1 per world
- [x] GET /api/worlds/:worldId/calendar-config (jen členové), PUT (PJ/Admin)

**Spec:** `docs/superpowers/specs/2026-05-04-krok-10cd-timeline-calendar-config-design.md`  
**Plán:** `docs/superpowers/plans/2026-05-04-krok-10cd-timeline-calendar-config.md`

---

## Krok 10e — WorldCurrencies ✅

> Měnový systém světa se seedem dle žánru a přepočty.

- [x] WorldCurrencyItem: code, name, ratio, symbol
- [x] Seed při vytvoření světa dle genre (fantasy → zlatý/stříbrný/bronzový...)
- [x] GET /api/worlds/:id/currencies, PUT (full replace)
- [x] CurrencyConverter logic: přepočet mezi světovými měnami

**Spec:** —  
**Plán:** —

---

## Krok 10f — WorldWeather ✅

> AUDIT (aktualizováno 2026-05-07): standalone modul [world-weather/](../backend/src/modules/world-weather/) implementován (schema, repository, controller, service, spec).

> Generátor počasí per world s konfigurovatelnou logikou a broadcast do chatu/mapy.

- [x] WeatherGenerator schema: config (tempMin/Max, weatherTypes, wind, pressure, humidity, customFields), currentWeather
- [x] Vážená náhoda výběru typu počasí, generování teploty/oblačnosti/srážek/větru/tlaku/vlhkosti/custom polí
- [x] GET/POST/PUT/DELETE /api/worlds/:worldId/weather-generators
- [x] POST /:id/generate → vygeneruj z configu, uloží do currentWeather
- [x] PUT /:id/current → ruční nastavení currentWeather
- [x] POST /:id/broadcast → chat (ChatMessage se systemovým senderem) nebo mapa (Socket.io weather:updated)
- [x] Seed defaultního generátoru dle genre při vytvoření světa

**Spec:** [docs/superpowers/specs/2026-05-04-krok-10f-world-weather-design.md](superpowers/specs/2026-05-04-krok-10f-world-weather-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-10f-world-weather.md](superpowers/plans/2026-05-04-krok-10f-world-weather.md)

---

## Krok 10g — WorldNews ✅

> AUDIT (aktualizováno 2026-05-07): standalone modul [world-news/](../backend/src/modules/world-news/) implementován (schema, repository, controller, service, spec).

> Světové novinky (globální i per-world) viditelné pro anonymní uživatele.

- [x] NewsItem schema: worldId (null = globální), title, content, date (ISO 8601), type (info/alert/system), link
- [x] Index: (worldId, date DESC)
- [x] GET /api/news (limit?), GET /:id, POST, PUT, DELETE — všechny GET anon

**Spec:** [docs/superpowers/specs/2026-05-04-krok-10g-world-news-design.md](superpowers/specs/2026-05-04-krok-10g-world-news-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-10g-world-news.md](superpowers/plans/2026-05-04-krok-10g-world-news.md)

---

## Krok 11a — IkarosNews ✅

> Platformové novinky — jednoduchý CRUD bez schvalovacího workflow.

- [x] Schema: title, content, authorId (server-filled), authorName (server-filled), createdAtUtc (server-filled), isActive (bool)
- [x] GET je AllowAnonymous, žádný approval workflow
- [x] POST/DELETE: jen Superadmin/Admin/PJ
- [x] Route: `/IkarosNews` (bez api/ prefixu — zpětná kompatibilita)

**Spec:** [docs/superpowers/specs/2026-05-04-krok-11a-ikaros-news-design.md](superpowers/specs/2026-05-04-krok-11a-ikaros-news-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-11a-ikaros-news.md](superpowers/plans/2026-05-04-krok-11a-ikaros-news.md)

---

## Krok 11b — IkarosArticles ✅

> Platformové články se schvalovacím tokem a hodnocením.

- [x] Schema: title, content (Markdown), category (Povidky/Poezie/Uvahy/Recenze/Postavy/Ostatni), authorId, authorName, status (Draft/Pending/Published/Rejected), rejectReason, ratings (userId+stars 1–5), averageRating, createdAtUtc, updatedAtUtc, publishedAtUtc
- [x] Workflow: Draft → Submit → Pending → Approve → Published | Reject → Rejected
- [x] Editovatelné jen ve stavu Draft nebo Rejected
- [x] Admin = Superadmin/Admin/PJ/SpravceClankuu nebo username "Tyky"
- [x] Notifikace: při submit (adminům), approve (autorovi), reject (autorovi)
- [x] GET (published + pending pro admin), GET /my, GET /pending (admin), POST, PUT, DELETE
- [x] POST /:id/submit, POST /:id/approve, POST /:id/reject, POST /:id/rate

**Spec:** [docs/superpowers/specs/2026-05-04-krok-11b-ikaros-articles-design.md](superpowers/specs/2026-05-04-krok-11b-ikaros-articles-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-11b-ikaros-articles.md](superpowers/plans/2026-05-04-krok-11b-ikaros-articles.md)

---

## Krok 11c — IkarosGallery ✅

> AUDIT: roadmapa měla checkboxy ⬜, ale modul je **plně implementovaný** (`backend/src/modules/ikaros-gallery/` má schema, service, controller, multipart upload, workflow, /rate, role `SpravceGalerie`). Checkboxy opraveny.

> Galerie obrázků se schvalovacím tokem — stejný workflow jako Articles.

- [x] Schema: title, description, imageUrl (Cloudinary public ID), authorId, authorName, status (Draft/Pending/Published/Rejected), rejectReason, ratings, averageRating, createdAtUtc, updatedAtUtc, publishedAtUtc
- [x] Upload: multipart/form-data (file, title, description, submit bool) → UploadService → Cloudinary ID uložen
- [x] Stejný workflow a notifikace jako Articles
- [x] Admin zahrnuje i SpravceGalerie roli
- [x] GET, GET /my, GET /pending, POST (multipart), PUT (jen title/description), DELETE
- [x] POST /:id/submit, POST /:id/approve, POST /:id/reject, POST /:id/rate

**Spec:** [docs/superpowers/specs/2026-05-04-krok-11c-ikaros-gallery-design.md](superpowers/specs/2026-05-04-krok-11c-ikaros-gallery-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-11c-ikaros-gallery.md](superpowers/plans/2026-05-04-krok-11c-ikaros-gallery.md)

---

## Krok 11d — IkarosDiscussions ✅

> Diskuzní fórum se schvalováním, manažery, pozváním a oblíbenými.

- [x] Schema: title, description, bulletin (editovatelné oznámení), creatorId, creatorName, isApproved, isOpen, managerIds (creator auto-přidán), invitedUserIds, postCount, likeCount, createdAtUtc, lastActivityUtc
- [x] IkarosDiscussionPost: discussionId, authorId, authorName, content, createdAtUtc
- [x] Oprávnění: creator/manažeři editují; admin schvaluje non-adminům; jen manager/admin může zvát
- [x] Notifikace: submit (adminům), approve (creatorovi), reject (s důvodem)
- [x] GET (filtrováno dle approval), GET /pending, GET /my-favorites
- [x] POST /:id/approve, POST /:id/reject, POST /:id/invite, POST /:id/toggle-favorite
- [x] GET /:id/posts (stránkované), POST /:id/posts, DELETE /:id/posts/:postId

**Spec:** [docs/superpowers/specs/2026-05-04-krok-11d-ikaros-discussions-design.md](superpowers/specs/2026-05-04-krok-11d-ikaros-discussions-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-11d-ikaros-discussions.md](superpowers/plans/2026-05-04-krok-11d-ikaros-discussions.md)

---

## Krok 12a — Custom Emotes & Image proxy ✅

> Per-world custom emote shortcody a Cloudinary image proxy pro zpětnou kompatibilitu.

### Custom Emotes
- [x] Schema: worldId (null = globální), name, shortcode, imageId, createdBy, createdAt; unique index (worldId, shortcode)
- [x] Per-world izolace + globální emoty (worldId=null, Admin/Superadmin)
- [x] GET /api/emotes/:worldId (JWT, člen světa), POST (PJ/PomocnýPJ+), DELETE, POST /:id/copy (PJ v obou světech)
- [x] GET /api/emotes/global, POST /global (Admin+), DELETE /global/:id
- [x] WebSocket broadcast `emote:created` do `world:{worldId}` při vytvoření per-world emote
- [x] `:shortcode:` syntaxe — frontend zodpovědnost

### Image serving
- [x] GET /api/images/* → HTTP 302 redirect na Cloudinary URL (wildcard pro folder paths)
- [x] Slouží pro zpětnou kompatibilitu s uloženými Cloudinary public ID

**Spec:** [docs/superpowers/specs/2026-05-04-krok-12a-emotes-image-proxy-design.md](superpowers/specs/2026-05-04-krok-12a-emotes-image-proxy-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-12a-emotes-image-proxy.md](superpowers/plans/2026-05-04-krok-12a-emotes-image-proxy.md)

---

## Krok 12b — Sound Database ✅

> Databáze zvuků s bohatými metadaty, integrace s taktickou mapou.

### Sound Database
- [x] Schema: name, youtubeUrl, mediaType, primaryFunction, environment, emotionalTone, intensity (1–5), duration, loop, onsetProfile, outroProfile, factionStyle, techLevel, magicLevel, combatEnergy, tags, notes; worldId (null = globální); status (active/pending/rejected); proposedBy/proposedByWorldId/rejectReason
- [x] GET /api/sounds (approved globální), GET /api/sounds/pending (Admin+), GET /api/sounds/:id, POST, PUT /:id, DELETE, POST /:id/approve, POST /:id/reject
- [x] GET /api/worlds/:worldId/sounds, GET /:id, POST, PUT /:id, DELETE, POST /:id/nominate, POST /import/:globalId
- [x] Schvalovací workflow: PJ nominuje per-world zvuk → Admin schválí/zamítne → status active/rejected
- [x] Deduplicita: URL exact match + name case-insensitive při nominaci i přímém přidání
- [x] MapHub integrace: activeSoundIds na MapScene broadcastovány přes existující `map:sound-changed` event

**Spec:** [docs/superpowers/specs/2026-05-05-krok-12b-sound-database-design.md](superpowers/specs/2026-05-05-krok-12b-sound-database-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-05-krok-12b-sound-database.md](superpowers/plans/2026-05-05-krok-12b-sound-database.md)

---

## Krok 13 — Push notifikace ✅

> VAPID web push, odběry per user, notifikace per typ kanálu.

- [x] **VapidSettings**: publicKey, privateKey, subject (v konfiguraci)
- [x] GET /api/push/vapid-public-key (anon) → vrátí VAPID public key
- [x] POST /api/push/subscribe (JWT) → upsert PushSubscription (userId, endpoint [unique index], p256dh, auth, createdAt)
- [x] POST /api/push/unsubscribe (JWT) → smaž subscription dle endpoint
- [x] Auto-delete subscriptions při 404/410 odpovědi z push service
- [x] **WebPushService**: odešle notifikaci na všechny aktivní subscription daného usera
- [x] **Příjemci notifikace dle typu kanálu**:
  - Whisper → jen recipienti z visibleTo
  - Participants channel → jen participants
  - GroupRequired channel → jen členové skupiny
  - Global → všichni online (GlobalChat + IkarosNews)
- [x] Integrace s ChatService: po uložení zprávy → async push notifikace
- [x] **GameEventReminderJob**: cron každou hodinu, push 24h před eventem

**Spec:** [docs/superpowers/specs/2026-05-05-krok-13-push-notifikace-design.md](superpowers/specs/2026-05-05-krok-13-push-notifikace-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-05-krok-13-push-notifikace.md](superpowers/plans/2026-05-05-krok-13-push-notifikace.md)

---

## Krok 14 — Vyhledávání ✅

### Full-text Search (MeiliSearch)
- [x] Zvolená technologie: **MeiliSearch**
- [x] Indexovaná pole: slug, title (titleExact 100, title 15), paragraphs (5), tableTitle (5), headers (3), values (3)
- [x] Czech tokenizace, typo tolerance, prefix matching
- [x] Rebuild při startu; inkrementální add/update/delete

### Embedding Search (ONNX Granite)
- [x] Zvolená technologie: **onnxruntime-node + Granite modely (sentencepiece-js)**
- [x] PageEmbedding schema: pageId, slug, modelKey, pageHash, chunkId, chunkTitle, chunkPreview, chunkOrder, vector, createdAt
- [x] Chunking: 750 znaků s překryvem 250
- [x] Hash-skip: přeskoč re-embedding pokud pageHash nezměněn
- [x] Async fronta (EmbeddingQueue): Upsert/Delete/Rebuild + rebuild-backlog
- [x] Stavový automat: Unknown → Starting → Scanning → Embedding → EverythingEmbedded | Rebuilding

### SearchCoordinator
- [x] Fasáda nad oběma providery
- [x] Kombinace výsledků round-robin s deduplikací
- [x] Mutations jdou do obou providerů
- [x] GET /api/search?q=&count=5&provider=&worldId=
- [x] GET /api/search/providers
- [x] POST /api/search/created, /updated, /deleted
- [x] POST /api/search/reindex, /rebuild

### Stats
- [x] SearchIndexStats + IndexingFailure schema
- [x] GET /api/stats/search, POST /api/stats/search/rebuild, POST /api/stats/search/reindex

### Integrace
- [x] PagesService volá SearchCoordinator při create/update/delete (backend-driven)

**Spec:** [docs/superpowers/specs/2026-05-05-krok-14-vyhledavani-design.md](superpowers/specs/2026-05-05-krok-14-vyhledavani-design.md)
**Plán:** [docs/superpowers/plans/2026-05-05-krok-14-vyhledavani.md](superpowers/plans/2026-05-05-krok-14-vyhledavani.md)

---

## Krok 15 — Admin & Systémové nástroje ✅

> Admin endpoints pro správu uživatelů a stránek, rozšíření world membership workflow, background joby pro údržbu, Socket.io + CORS konfigurace.

### Admin User Management
- [x] GET /api/admin/users (filtrování dle username/role, stránkování)
- [x] PATCH /api/admin/users/:id/role (změna role)
- [x] ~~PATCH /api/admin/users/:id/akj~~ _(zrušeno 2026-05-05 — AKJ je per-world, viz cleanup spec)_
- [x] GET /api/admin/recent-pages (Superadmin vidí vše, PJ jen své světy)

### World Admin
- [x] GET /api/worlds/:id/members (s filtry ?role= a ?group=)
- [x] PATCH /api/worlds/:id/members/:membershipId/free (isFree — hráč bez postavy)
- [x] POST /api/ikaros-messages/:id/resolve — rozšíření: přiřazení role/group/characterPath/isFree při přijetí hráče

### Background Jobs
- [x] GameEventCleanupJob: každou hodinu → smaž GameEvents starší než 24h
- [x] CleanupInactiveUsersJob: každou hodinu → odpoj socket uživatele neaktivní > 1h
- [x] CleanMessagesJob: každé 2h → smaž chat zprávy starší než 2h (zachová posledních 100)
- [x] EmbeddingQueueProcessor: continuous loop (implementován v Kroku 14)

### Infra
- [x] CustomIoAdapter: Socket.io maxHttpBufferSize 5 MB + WebSocket CORS
- [x] CORS: localhost:5173/5174 + FRONTEND_URL env proměnná

**Spec:** [docs/superpowers/specs/2026-05-05-krok-15-admin-systemove-nastroje-design.md](superpowers/specs/2026-05-05-krok-15-admin-systemove-nastroje-design.md)
**Plán:** [docs/superpowers/plans/2026-05-05-krok-15-admin-systemove-nastroje.md](superpowers/plans/2026-05-05-krok-15-admin-systemove-nastroje.md)

---

## Krok 16a — Feature Parity Checklist ✅

**Spec:** [docs/superpowers/specs/2026-05-05-krok-16a-feature-parity-design.md](superpowers/specs/2026-05-05-krok-16a-feature-parity-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-05-krok-16a-feature-parity.md](superpowers/plans/2026-05-05-krok-16a-feature-parity.md)

> Kontrola feature parity se starým systémem — ověření že nový backend pokrývá vše co starý.

### Feature Parity Checklist
- [x] Všechny MongoDB kolekce přítomny
- [x] Všechny 3 real-time huby funkční: ChatGateway, MapGateway, GlobalChatGateway
- [x] JWT claims: sub, unique_name, role, characterPath, ikarosSkin _(akj záměrně NE — AKJ je per-world, vědomá odchylka od starého kontraktu)_
- [x] Seed data: Matrix world, 6 chat skupin, 5 šablon stránek per nový svět
- [x] Všechny RPG systémy mají SystemPreset konfiguraci
- [x] Push notifikace dorazí při každé chat zprávě (per channel type)
- [x] Vyhledávání pokrývá Pages fulltext + embeddings
- [x] Admin může dělat vše co v starém systému

**Analýza:** [docs/checklist-be.md](../checklist-be.md)

---

## Krok 16b — Feature Parity Implementace ✅

> AUDIT (aktualizováno 2026-05-07): všechny mezery zaplněny. Chat fields (`type` na ChatChannel, `customFont`/`color`/`isDiceRoll` na ChatMessage), GlobalChat WS události, `POST /auth/refresh`, `GET /users/exists/:username`, `PUT /users/:id/theme`, `POST /admin/users`, GameEvents CRUD (Krok 10a), `PUT /worlds/:worldId/calendarconfig`.

- [x] **Chat** — `type` (team_ic/ooc/pj) na `ChatChannel` ([chat-channel.schema.ts:18](../backend/src/modules/chat/schemas/chat-channel.schema.ts#L18))
- [x] **Chat** — `customFont` + `color` + `isDiceRoll` na `ChatMessage` ([chat-message.schema.ts:27,42,46](../backend/src/modules/chat/schemas/chat-message.schema.ts#L27))
- [x] **Chat** — soft-delete vrací `"*Zpráva byla smazána autorem*"` ([chat.service.ts:536](../backend/src/modules/chat/chat.service.ts#L536))
- [x] **Chat** — blokování smazání kostek (`isDiceRoll` guard, [chat.service.ts:516](../backend/src/modules/chat/chat.service.ts#L516))
- [x] **Chat** — editace příloh v `UpdateMessageDto` (`attachmentsToAdd` / `attachmentsToRemove`)
- [x] **GlobalChat WS** — `ikaros:load-history` při joinu místnosti
- [x] **GlobalChat WS** — `ikaros:user-list` presence seznam
- [x] **GlobalChat WS** — `ikaros:room-style-changed` + `ikaros:set-room-style`
- [x] **GlobalChat WS** — `handleDisconnect` presence cleanup
- [x] **GlobalChat** — `color` pole na globálních zprávách
- [x] **Auth** — `POST /api/auth/refresh` ([auth.controller.ts:55](../backend/src/modules/auth/auth.controller.ts#L55))
- [x] **Users** — `GET /api/users/exists/:username` ([users.controller.ts:96](../backend/src/modules/users/users.controller.ts#L96))
- [x] **Users** — `PUT /api/users/:id/theme` ([users.controller.ts:121](../backend/src/modules/users/users.controller.ts#L121))
- [x] **Admin** — `POST /api/admin/users` ([admin.controller.ts:68](../backend/src/modules/admin/admin.controller.ts#L68))
- [x] **Game Events** — plný CRUD `/api/events` + `POST /:id/confirm` (viz Krok 10a)
- [x] **Worlds** — `PUT /api/worlds/:worldId/calendarconfig` ([worlds.controller.ts:172](../backend/src/modules/worlds/worlds.controller.ts#L172))

**Plán:** [docs/superpowers/plans/2026-05-05-krok-16b-feature-parity-implementation.md](superpowers/plans/2026-05-05-krok-16b-feature-parity-implementation.md)

---

## Krok 18 — Dokumentace API ✅

> Swagger/OpenAPI dokumentace všech endpointů + WebSocket event dokumentace.

### Swagger / OpenAPI
- [x] Swagger/OpenAPI pro všechny REST endpointy
- [x] Každý endpoint má popsané request/response typy, auth požadavky a příklady

### WebSocket dokumentace
- [x] WebSocket event dokumentace (Gateway events in/out)
- [x] Popis všech emitovaných a přijímaných událostí pro ChatGateway, MapGateway, GlobalChatGateway

**Spec:** —  
**Plán:** —

---

## Krok 17 — Opravy Feature Parity ✅

> AUDIT (po fázi 4): všechny 4 opravy ověřeny — 17c `GET /api/global-chat/room-info` v `global-chat.controller.ts:23`, 17d `GET /users/getCalendarMonth/:id` (řádek 39) + `PUT /users/updateCalendarMonth/:id` (řádek 58).

> Čtyři konkrétní opravy zjištěné po Kroku 16b — broken whisper routing, chybějící WS handlery, room-info endpoint a user calendar-month endpointy.

### 17a — Fix `chat:hospoda:join` userId tracking ✅
- [x] Přidat `userId` do payloadu `chat:hospoda:join`
- [x] Socket se připojí do místnosti `user:${userId}` (oprava broken whisper routing)
- [x] Přidat veřejnou metodu `getPresence()` na gateway

### 17b — `ikaros:whisper` WS handler ✅
- [x] Přidat `sendWhisper()` metodu do `GlobalChatService`
- [x] Přidat `@SubscribeMessage('ikaros:whisper')` handler do gateway

### 17c — GET /api/global-chat/room-info ✅
- [x] Injektovat `GlobalChatGateway` do `GlobalChatController`
- [x] Přidat endpoint vracející `{ channelId, users[] }`

### 17d — User calendar-month endpointy ✅
- [x] `GET /api/users/getCalendarMonth/:id` — čte z `themeSettings.calendarMonth`
- [x] `PUT /api/users/updateCalendarMonth/:id` — ukládá přes existující `update()` merge

**Plán:** [docs/superpowers/plans/2026-05-05-krok-17-opravy-feature-parity.md](superpowers/plans/2026-05-05-krok-17-opravy-feature-parity.md)

---

## Krok 19 — Migrace dat ⬜

> Přenos dat ze starého systému do nového + vyřešení breaking changes.

### Datová migrace
- [ ] Export script: starý MongoDB → JSON dump
- [ ] Import script: JSON dump → nový schéma (transformace polí)
- [ ] Ověření: počty dokumentů, ukázkové queries

### Breaking changes k řešení
- [ ] **Pages favorites**: starý systém ukládal oblíbené stránky na `User.FavoritePagesSlugs` (cross-world); nový ukládá per-world na `World.favoritePageSlugs` — nutná migrace nebo compatibility layer
- [ ] **Chat kanály**: starý `/api/chat/channels` → nový `/api/worlds/:worldId/chat/channels` — URL změna
- [ ] **NPC Templates**: globální → world-scoped s importem — migrace dat

**Spec:** —  
**Plán:** —

---

## Jak přidat nový krok

1. Zkopíruj šablonu spec: `docs/arch/_templates/`
2. Vytvoř spec: `docs/superpowers/specs/YYYY-MM-DD-krok-N-nazev-design.md`
3. Nech vygenerovat plán: `docs/superpowers/plans/YYYY-MM-DD-krok-N-nazev.md`
4. Doplň odkaz do tohoto souboru
5. Odškrtávej checkboxy průběžně
6. Po dokončení změň `⬜` → `✅`

---

## Přehled stavu

| Krok | Název | Stav | Audit poznámka |
|------|-------|------|----------------|
| 1 | Základ & Auth | ✅ | refresh + logout + logout-all hotové (rotace + blacklist) |
| 2 | Světy | ✅ | JOIN flow ověřen ve fázi 4 |
| 3 | Chat & Upload | ✅ | chat fields doplněny ve fázi 16b |
| 4 | Users rozšíření | ✅ | |
| 5 | Presence & IkarosMessages | ✅ | |
| 6 | Pages (Wiki) | ✅ | |
| 7a | Characters RPG rozšíření | ✅ | |
| 7b | NPC Templates | ✅ | |
| 7c | Universe Map | ✅ | visibility filter + 3 spec testy |
| 7d | RPG System Presets | ✅ | 13 presetů + auto-seed |
| 8a | Taktická mapa | ✅ | |
| 8b | Dungeon Builder | ✅ | |
| 9 | Kampaně | ✅ | |
| 10a | GameEvent | ✅ | controller + service hotové |
| 10b | Calendar | ✅ | standalone modul `calendars/` |
| 10c | TimelineEvent | ✅ | standalone modul `timeline/` |
| 10d | WorldCalendarConfig | ✅ | standalone modul + samostatná kolekce |
| 10e | WorldCurrencies | ✅ | |
| 10f | WorldWeather | ✅ | standalone modul `world-weather/` |
| 10g | WorldNews | ✅ | standalone modul `world-news/` |
| 11a | IkarosNews | ✅ | |
| 11b | IkarosArticles | ✅ | |
| 11c | IkarosGallery | ✅ | (roadmapa původně lhala opačně) |
| 11d | IkarosDiscussions | ✅ | |
| 12a | Custom Emotes & Image proxy | ✅ | |
| 12b | Sound Database | ✅ | |
| 13 | Push notifikace | ✅ | |
| 14 | Vyhledávání | ✅ | |
| 15 | Admin & Systémové nástroje | ✅ | CustomIoAdapter 5MB+CORS ověřen |
| 16a | Feature Parity Checklist | ✅ | |
| 16b | Feature Parity Implementace | ✅ | všechny mezery zaplněny |
| 17a | Oprava: hospoda:join userId | ✅ | |
| 17b | Oprava: ikaros:whisper handler | ✅ | |
| 17c | Oprava: room-info endpoint | ✅ | |
| 17d | Oprava: calendar-month endpointy | ✅ | |
| 18 | Dokumentace API | ✅ | websocket-api.md (163 řádků, 8 sekcí) |
| 19 | Migrace dat | ⬜ | |

**Souhrn po auditu 2026-05-07:** ✅ 34 / 🚧 0 / ⬜ 1 (z 35 kroků). Zbývá pouze Krok 19 — Migrace dat ze starého systému. Opravný plán → [roadmap2.md](roadmap2.md).
