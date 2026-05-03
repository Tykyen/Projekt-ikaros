# Projekt Ikaros — Vývojová linka

Centrální přehled všech kroků. Každý krok má vlastní spec + plán v `docs/superpowers/`.  
Vychází z analýzy starého systému (`C:\Matrix\Matrix`) + `docs/old/`.

**Stav:** `✅ hotovo` | `🚧 probíhá` | `⬜ plánováno`

> **Zásada:** Nový systém musí pokrýt vše, co zvládal starý. Tam kde starý používal Google Drive → **Cloudinary**. Tam kde starý používal SignalR → **NestJS Gateway (Socket.io)**. Tam kde starý používal Lucene → **MeiliSearch nebo MongoDB Atlas Search**.

---

## Krok 1 — Základ & Auth ✅

- [x] Auth modul: POST /api/auth/login (bcrypt verify → JWT), POST /api/auth/refresh/:id
- [x] JWT claims: sub (userId), unique_name (username), role, characterPath, ikarosSkin, akj
- [x] JWT 24h expiry, HS256, guard `JwtAuthGuard`, decorator `@CurrentUser()`
- [x] Users modul: CRUD, 9 rolí (User/Player/PJ/Korektor/SpravceXxx/Admin/Superadmin)
- [x] User schema: passwordHash, profileImageUrl, groups, themeSettings, chatPreferences, akj, characterPath
- [x] Worlds modul základ: World CRUD (name, slug, description, genre, accessMode)
- [x] DB seed: Matrix world, první PJ vlastník

**Plán:** [docs/superpowers/plans/2026-05-01-krok-1-zaklad.md](superpowers/plans/2026-05-01-krok-1-zaklad.md)

---

## Krok 2 — Světy ✅

- [x] WorldMembership: userId, worldId, role (Pending/Hrac/Korektor/PomocnyPJ/PJ), avatarUrl, characterPath, group, akj
- [x] JOIN logika: kontrola accessMode → vytvoř Pending nebo Hrac, odešli IkarosMessage vlastníkovi (na krok 5)
- [x] World settings: hiddenNavItems, customGroups, groupColors, currencies (seed dle genre)
- [x] WorldCalendarConfig struktura: daysOfWeek, months (s daysCount), celestialBodies
- [x] Worlds controller: GET all, GET /my, POST, PATCH metadata, GET+PUT /settings, /calendarconfig, /members

**Plán:** [docs/superpowers/plans/2026-05-01-krok-2-svety.md](superpowers/plans/2026-05-01-krok-2-svety.md)

---

## Krok 3 — Chat & Upload ✅

### 3a — Chat core ✅
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

- [x] **AKJ flag**: boolean na user schema; zahrnuto v JWT claims (`akj`)
- [x] **ThemeSettings**: volný JSON blob `Record<string, unknown>` na user schema
- [x] **ChatPreferences**: volný JSON blob `Record<string, unknown>` na user schema
- [x] **LastSeenAt v JwtAuthGuard**: fire-and-forget `updateLastSeen` při každém úspěšném JWT; `isOnline` se nenastavuje (řeší Krok 5 Presence)
- [x] **PublicUser interface + GET /api/users/profile/:id**: veřejný subset (id, username, displayName, avatarUrl, characterPath, role, createdAt), bez JWT
- [x] **JWT claims rozšíření**: přidán `akj` claim
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

## Krok 8b — Dungeon Builder ⬜

> Canvas nástroj pro procedurální tvorbu dungeonů. Frontend-only, ukládá jako MapTemplate nebo MapScene.

- [ ] Nástroj pro tvorbu dungeonů z mapových dlaždic (hex/square grid)
- [ ] Export do PNG nebo uložení jako MapTemplate/MapScene
- [ ] Perzistentní scény (backend integruje s Krok 8a maps modulem)

**Spec:** —  
**Plán:** —

---

## Krok 9 — Kampaně ⬜

> 6 modelů pro GM nástroje — pavučina vztahů, příběhové linky, scénáře.

### CampaignSubject (uzly pavučiny)
- [ ] Schema: ownerId, worldId, type (PC/NPC/FACTION/ORG), name, avatarUrl, tags, status (active/archived), linkedPageSlug, linkedDiarySlug, notes, createdAtUtc, updatedAtUtc
- [ ] PJ vidí vše; non-PJ vidí jen vlastní (ownerId === currentUserId)

### CampaignRelationship
- [ ] Schema: ownerId, worldId, subjectAId, subjectBId
- [ ] Sdílená vrstva: whatHappened, behindTheScenes
- [ ] Perspektivy SideA/SideB: tone, behavior, gmIntent
- [ ] status: active/dormant/crisis/closed, priority, storylineIds, lastChangeNote

### CampaignStoryline
- [ ] Schema: ownerId, worldId, level (macro/mid/micro), title, status (active/dormant/escalating/climax/closed)
- [ ] phase, summary, whatHappened, truth (GM-only), playersBelief, gmIntent
- [ ] nextStep (zobrazuje se na dashboardu), subjectIds, relationshipIds

### CampaignScenario
- [ ] Schema: ownerId, worldId, title, contentData (TipTap JSON), order (auto-increment), linkedPageSlug, subjectIds, storylineIds, images (gallery URLs)

### CampaignQuickNote
- [ ] Schema: ownerId, worldId, title, body, status (open/done), pinned, subjectIds, storylineIds

### CampaignShopItem
- [ ] Schema: ownerId, worldId, name, description, group/subgroup, price, currencyCode, linkedItemIds (cross-reference), referenceLink, isRecommended
- [ ] Kaskádové mazání: deleteItem → pull z linkedItemIds ostatních

### Dashboard endpoint
- [ ] GET /api/campaign/dashboard → crisisRelationships, activeStorylines, pinnedNotes, recentChanges (max 20)

### REST API (29 endpointů)
- [ ] Všechny modely: GET (s filtry: ownerId/type/status/worldId), GET /:id, POST, PUT /:id, DELETE
- [ ] Sorted: updatedAtUtc / priority / pinned
- [ ] PJ_BASE_ token: PJ vidí vlastní data + legacy (null ownerId); prefix se stripne při create

**Spec:** [docs/superpowers/specs/2026-05-03-krok-9-kampane-design.md](superpowers/specs/2026-05-03-krok-9-kampane-design.md)  
**Plán:** —

---

## Krok 10 — Herní čas & Svět ⬜

> GameEvent, Kalendář, Timeline, WorldCalendar, měny, počasí.

### GameEvent
- [ ] Schema: worldId, title, date (ISO string, sort key), targetGroup, imageUrl, description, confirmable (RSVP toggle), confirmedBy (EventConfirmation: userId/userName)
- [ ] Index: (worldId, date)
- [ ] GET /api/game-events (filtry: worldId/limit/fromDate), POST, PUT (zachová confirmedBy pokud incoming null), DELETE
- [ ] POST /api/game-events/:id/confirm (toggle účasti)
- [ ] **GameEventCleanupService**: cron job (každou hodinu), smaže eventy starší než 24h

### Calender (per-character herní deník)
- [ ] Schema: worldId, slug (key = characterSlug), events (CalendarEvent: id/title/description/start/end/hourStart/hourEnd/allDay)
- [ ] PUT: nahradí celé Events; auto-create pokud chybí; fixWorldId pokud neshoda
- [ ] GET /api/calenders/:slug, PUT

### TimelineEvent
- [ ] Schema: worldId, year/month/day (strings pro fantasy formáty), text, imageUrl, link
- [ ] Base64 stripping: GET /api/timeline stripuje data: URI; GET /:id zachová; PUT zachová base64 pokud incoming null
- [ ] GET, POST, PUT, DELETE

### WorldCalendarConfig (rozšíření světa)
- [ ] daysOfWeek, months (s daysCount), celestialBodies
- [ ] Použito frontend kalendářem pro správné zobrazení fantasy datumů

### Měnový systém (WorldCurrencies)
- [ ] WorldCurrencyItem: code, name, ratio, symbol
- [ ] Seed při vytvoření světa dle genre (fantasy → zlatý/stříbrný/bronzový...)
- [ ] GET /api/worlds/:id/currencies, PUT (full replace)
- [ ] CurrencyConverter logic: přepočet mezi světovými měnami

### Weather Generator (WorldWeather)
- [ ] WeatherGenerator config per world: parametry pro generování počasí
- [ ] GET /api/worlds/:id/weather-generators, PUT
- [ ] POST /api/worlds/:id/weather/generate → vygeneruj aktuální počasí dle konfigurace

### Světové novinky (World News)
- [ ] NewsItem schema: worldId (null = globální), title, content, date (ISO 8601), type (info/alert/system), link
- [ ] Index: (worldId, date DESC)
- [ ] GET /api/news (limit?), GET /:id, POST, PUT, DELETE — všechny GET anon

**Spec:** —  
**Plán:** —

---

## Krok 11 — Ikaros obsah ⬜

> Platformové články, diskuze, galerie, novinky — schvalovací toky.

### IkarosArticles
- [ ] Schema: title, content (Markdown), category (Povidky/Poezie/Uvahy/Recenze/Postavy/Ostatni), authorId, authorName, status (Draft/Pending/Published/Rejected), rejectReason, ratings (userId+stars 1–5), averageRating, createdAtUtc, updatedAtUtc, publishedAtUtc
- [ ] Workflow: Draft → Submit → Pending → Approve → Published | Reject → Rejected
- [ ] Editovatelné jen ve stavu Draft nebo Rejected
- [ ] Admin = Superadmin/Admin/PJ/SpravceClankuu nebo username "Tyky"
- [ ] Notifikace: při submit (adminům), approve (autorovi), reject (autorovi)
- [ ] GET (published + pending pro admin), GET /my, GET /pending (admin), POST, PUT, DELETE
- [ ] POST /:id/submit, POST /:id/approve, POST /:id/reject, POST /:id/rate

### IkarosDiscussions
- [ ] Schema: title, description, bulletin (editovatelné oznámení), creatorId, creatorName, isApproved, isOpen, managerIds (creator auto-přidán), invitedUserIds, postCount, likeCount, createdAtUtc, lastActivityUtc
- [ ] IkarosDiscussionPost: discussionId, authorId, authorName, content, createdAtUtc
- [ ] Oprávnění: creator/manažeři editují; admin schvaluje non-adminům; jen manager/admin může zvát
- [ ] Notifikace: submit (adminům), approve (creatorovi), reject (s důvodem)
- [ ] GET (filtrováno dle approval), GET /pending, GET /my-favorites
- [ ] POST /:id/approve, POST /:id/reject, POST /:id/invite, POST /:id/toggle-favorite
- [ ] GET /:id/posts (stránkované), POST /:id/posts, DELETE /:id/posts/:postId

### IkarosGallery
- [ ] Schema: title, description, imageUrl (Cloudinary public ID), authorId, authorName, status (Draft/Pending/Published/Rejected), rejectReason, ratings, averageRating, createdAtUtc, updatedAtUtc, publishedAtUtc
- [ ] Upload: multipart/form-data (file, title, description, submit bool) → UploadService → Cloudinary ID uložen
- [ ] Stejný workflow a notifikace jako Articles
- [ ] Admin zahrnuje i SpravceGalerie roli
- [ ] GET, GET /my, GET /pending, POST (multipart), PUT (jen title/description), DELETE
- [ ] POST /:id/submit, POST /:id/approve, POST /:id/reject, POST /:id/rate

### IkarosNews (platformové novinky)
- [ ] Schema: title, content, authorId (server-filled), authorName (server-filled), createdAtUtc (server-filled), isActive (bool, žádný Draft/Published state)
- [ ] GET je AllowAnonymous, žádný approval workflow
- [ ] POST/DELETE: jen Superadmin/Admin/PJ
- [ ] GET /api/ikaros-news (anon), POST, DELETE

**Spec:** —  
**Plán:** —

---

## Krok 12 — Média & Emotes & Zvuky ⬜

> Databáze zvuků, custom emotes per world, správa médií.

### Custom Emotes
- [ ] Schema: worldId, name, shortcode (":name:"), imageId (Cloudinary public ID), createdAt
- [ ] Per-world izolace
- [ ] GET /api/emotes/:worldId (Authorize), POST /:worldId (PJ+), DELETE /:worldId/:id (PJ+)
- [ ] Emote picker: WebSocket broadcast nového emote při vytvoření
- [ ] Integrace s chat inputem (podpora `:shortcode:` syntaxe)

### Sound Database
- [ ] Schema: id, name, youtubeUrl, mediaType, primaryFunction, environment, emotionalTone, intensity (1–5), duration, loop, onsetProfile, outroProfile, factionStyle, techLevel, magicLevel, combatEnergy, tags, notes
- [ ] GET /api/sounds (all), GET /:id, POST, PUT /:id, DELETE
- [ ] MapHub integrace: activeSoundIds na MapScene (změny broadcastovány přes MapHub)
- [ ] Per-world sounds: GET /api/worlds/:id/sounds

### Image serving
- [ ] GET /api/images/:id → proxy z Cloudinary (in-memory stream, zachová mimetype)
- [ ] Slouží pro zpětnou kompatibilitu s uloženými Cloudinary public ID

**Spec:** —  
**Plán:** —

---

## Krok 13 — Push notifikace ⬜

> VAPID web push, odběry per user, notifikace per typ kanálu.

- [ ] **VapidSettings**: publicKey, privateKey, subject (v konfiguraci)
- [ ] GET /api/push/vapid-public-key (anon) → vrátí VAPID public key
- [ ] POST /api/push/subscribe (JWT) → upsert PushSubscription (userId, endpoint [unique index], p256dh, auth, createdAt)
- [ ] POST /api/push/unsubscribe (JWT) → smaž subscription dle endpoint
- [ ] Auto-delete subscriptions při 404/410 odpovědi z push service
- [ ] **WebPushService**: odešle notifikaci na všechny aktivní subscription daného usera
- [ ] **Příjemci notifikace dle typu kanálu**:
  - Whisper → jen recipienti z visibleTo
  - Participants channel → jen participants
  - GroupRequired channel → jen členové skupiny
  - Global → všichni online
- [ ] Integrace s ChatService: po uložení zprávy → async push notifikace

**Spec:** —  
**Plán:** —

---

## Krok 14 — Vyhledávání ⬜

> Full-text search + sémantické embedding search — kombinovaný výsledek.

### Full-text Search (náhrada za Lucene)
- [ ] Zvolená technologie: **MeiliSearch** nebo **MongoDB Atlas Search** (rozhodnutí při specifikaci)
- [ ] Indexovaná pole: id, slug, title (boost 15), paragraphs/plainText (boost 5), headers (boost 3), tableTitle (boost 5), values (boost 3)
- [ ] Czech tokenizace, partial match (ngram pro title)
- [ ] Thread-safe rebuild ze všech Pages; inkrementální add/update/delete

### Embedding Search (náhrada za ONNX/Granite)
- [ ] Zvolená technologie: **OpenAI embeddings** nebo **lokální model** (rozhodnutí při specifikaci)
- [ ] PageEmbedding schema: pageId, slug, modelKey, pageHash (SHA256 pro detekci změn), chunkId, chunkTitle, chunkPreview, chunkOrder, vector, createdAt
- [ ] Chunking: 750 znaků s překryvem 250
- [ ] Hash-skip: přeskoč re-embedding pokud pageHash nezměněn
- [ ] Async fronta (Queue): Upsert/Delete/Rebuild operace
- [ ] Stavový automat: Unknown → Starting → Scanning → Embedding → EverythingEmbedded | Rebuilding

### SearchCoordinator
- [ ] Fasáda nad oběma providery
- [ ] Kombinace výsledků round-robin
- [ ] Mutations jdou do obou providerů
- [ ] GET /api/search?q=&count=5&provider=&worldId= (per-world scope)
- [ ] GET /api/search/providers
- [ ] POST /api/search/created, /updated, /deleted (webhook pro indexaci)
- [ ] POST /api/search/reindex `{ slug? | pageId? }`
- [ ] POST /api/search/rebuild (async, vrátí 202 Accepted)

### Stats
- [ ] SearchIndexStats schema: provider, status, processedPages, indexedCount, vectorCount, pendingPages, failedIndexings
- [ ] IndexingFailure: pageId, slug, error, timestamp
- [ ] GET /api/stats/search, POST /api/stats/search/rebuild, POST /api/stats/search/reindex

**Spec:** —  
**Plán:** —

---

## Krok 15 — Admin & Systémové nástroje ⬜

> Admin endpoints, správa obsahu, background jobs, stats.

### Admin User Management
- [ ] GET /api/admin/users (filtrování, stránkování)
- [ ] PATCH /api/admin/users/:id/role (změna role)
- [ ] PATCH /api/admin/users/:id/akj (toggle AKJ flagu)
- [ ] GET /api/admin/recent-pages (posledně upravené stránky)

### World Admin
- [ ] Auto-přidej všechny Korektor uživatele do Matrix World při jejich registraci
- [ ] Matrix WorldId jako konstanta (seed při prvním spuštění)
- [ ] GET /api/worlds/:id/members (s filtry role, group)
- [ ] PATCH /api/worlds/:id/members/:userId (změna role/group)
- [ ] DELETE /api/worlds/:id/members/:userId (vyhazování)

### Background Jobs (CronService)
- [ ] GameEventCleanupJob: každou hodinu → smaž GameEvents starší než 24h
- [ ] CleanupInactiveUsers: každých 45 min → odpoj neaktivní IkarosChat uživatele
- [ ] CleanMessages: každé 2h → smaž IkarosChat zprávy starší než 2h (max 100 zachováno per room)
- [ ] EmbeddingQueueProcessor: continuous → zpracovává frontu embedding operací

### Compression & Performance
- [ ] Brotli + GZip response compression middleware
- [ ] SignalR max message size: 5 MB
- [ ] Konfigurace CORS: produkční domény + localhost:5173/5174

**Spec:** —  
**Plán:** —

---

## Krok 16 — Finalizace & Integrace ⬜

> Kontrola feature parity se starým systémem, integrace všech modulů.

### Feature Parity Checklist
- [ ] Všechny MongoDB kolekce přítomny: Users, Pages, Characters, Calenders, ChatMessages, ChatChannels, ChatGroups, PageEmbeddings, GameEvents, News, TimelineEvents, ChannelReadStatuses, MapScenes, NpcTemplates, MapTemplates, IkarosArticles, IkarosDiscussions, IkarosGallery, IkarosNews, UniverseMaps, Worlds, WorldMemberships, CampaignSubjects, CampaignRelationships, CampaignStorylines, CampaignQuickNotes, CampaignShopItems, CampaignScenarios, Sounds, CustomEmotes, PushSubscriptions, SearchStats, FailedIndexings, IkarosMessages
- [ ] Všechny 3 real-time huby funkční: ChatGateway, MapGateway, IkarosChatGateway
- [ ] JWT claims identické: sub, unique_name, role, characterPath, ikarosSkin, akj
- [ ] Seed data: Matrix world, 6 chat skupin, 5 šablon stránek per nový svět
- [ ] Všechny RPG systémy mají SystemPreset konfiguraci
- [ ] Push notifikace dorazí při každé chat zprávě (per channel type)
- [ ] Vyhledávání pokrývá Pages fulltext + embeddings
- [ ] Admin může dělat vše co v starém systému

### Migrace dat (volitelné)
- [ ] Export script: starý MongoDB → JSON dump
- [ ] Import script: JSON dump → nový schéma (transformace polí)
- [ ] Ověření: počty dokumentů, ukázkové queries

### Dokumentace API
- [ ] Swagger/OpenAPI pro všechny endpointy
- [ ] WebSocket event dokumentace (Gateway events in/out)

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

| Krok | Název | Stav |
|------|-------|------|
| 1 | Základ & Auth | ✅ |
| 2 | Světy | ✅ |
| 3 | Chat & Upload | ✅ |
| 4 | Users rozšíření | ✅ |
| 5 | Presence & IkarosMessages | ✅ |
| 6 | Pages (Wiki) | ✅ |
| 7a | Characters RPG rozšíření | ✅ |
| 7b | NPC Templates | ✅ |
| 7c | Universe Map | ✅ |
| 7d | RPG System Presets | ✅ |
| 8a | Taktická mapa | ✅ |
| 8b | Dungeon Builder | ⬜ |
| 9 | Kampaně | ⬜ |
| 10 | Herní čas & Svět | ⬜ |
| 11 | Ikaros obsah | ⬜ |
| 12 | Média & Emotes & Zvuky | ⬜ |
| 13 | Push notifikace | ⬜ |
| 14 | Vyhledávání | ⬜ |
| 15 | Admin & Systémové nástroje | ⬜ |
| 16 | Finalizace & Integrace | ⬜ |
