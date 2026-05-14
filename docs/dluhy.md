# Technické dluhy

> Auto-aktualizuje harness agent (viz `.claude/rules/dluhy-log.md`).
> "Otevřené" = potřebují opravu nebo monitoring teď. "Čeká na trigger" = legitní budoucí práce, ne aktuální dluh. "Vyřešené" = auditní stopa.
> Komunikace s uživatelem před fixem zůstává — tento soubor je log, ne autonomní backlog.

---

_(žádné otevřené dluhy)_

---

## Čeká na trigger

Záznamy zde jsou legitní budoucí práce, ne aktuální technický dluh. Mají uvedený explicitní trigger — událost, která je převede do "Otevřené".

### Rate limit: Redis-backed throttler — TRIGGER: multi-instance deploy
- **Soubor:** `backend/src/app.module.ts` (ThrottlerModule.forRoot)
- **Trigger:** Migrace na 2+ replik backendu (Render/Railway scale-up, K8s deploy, nebo paralelní instance pro blue-green release).
- **Co dělá aktuální stav:** `@nestjs/throttler` používá in-memory storage. Pro single-instance deploy je to **správné rozhodnutí** — žádný Redis runtime overhead.
- **Co bude potřeba při triggeru:** Nainstalovat `@nestjs/throttler-storage-redis`, provisionovat sdílený Redis, override storage v ThrottlerModule. Bez sdíleného storage každá replika počítá vlastní bucket → reálné limity jsou N× vyšší než nakonfigurováno.
- **Zdroj:** Otevřený follow-up z `60a90c64` (rate limiting commit). Překlasifikováno 2026-05-06 z "Otevřené" — bez Redis runtime nelze opravit, single-instance deploy ho nepotřebuje.

---

## Vyřešené

### 2026-05-07 — Pages: role/membership gating na create/update/delete

- **Soubor:**
  - `backend/src/modules/pages/pages.service.ts` (přidáno `assertCanWrite()`, voláno z `create/update/delete`)
  - `backend/src/modules/pages/pages.controller.ts` (předává `@CurrentUser()` do služby pro všechny mutace)
  - `backend/src/modules/pages/pages.service.spec.ts` (5 nových testů pro role gating: bez membership, Hrac, PomocnyPJ, neexistující svět, Admin shortcut)
- **Co bylo:** `PagesService.create/update/delete` nevolaly žádný authorization check. Controller měl jen `@UseGuards(JwtAuthGuard)`, takže kterýkoli přihlášený Hrac mohl vytvořit/měnit/mazat stránky ve světě, ke kterému nemá membership. Smoke test (`scripts/backend-smoke-test.ts`) chybu odhalil: Hrac POST `/worlds/<cizi>/pages` → 201 místo 403.
- **Fix:** Přidán `assertCanWrite(worldId, requester)` analogicky k `timeline.service.ts:206`. Pravidla: Admin/Superadmin shortcut, jinak `WorldRole >= PomocnyPJ`. Vlastník světa není automaticky autorizován (per memory `project_world_authorization`). Per `.claude/rules/auth-leak-policy.md` auth-required pattern: 404 pokud svět neexistuje, 403 pro nedostatečnou roli.
- **Prevence:** Smoke skript `scripts/backend-smoke-test.ts` má krok "Hrac POST /worlds/:id/pages → 403", který by regression chytil. Dále unit test `pages.service.spec.ts` "Hrac bez membership dostane Forbidden".

### 2026-05-07 — Fáze 6 cleanup: full AppModule e2e bootstrap zprovozněn (5 DI bugů + uzavřen schema audit)
- **Commit:** _(přidán s docs commitem Fáze 6 cleanup)_
- **Soubor:**
  - `backend/src/modules/ikaros-articles/ikaros-articles.module.ts` (line 26 — `useExisting: IkarosMessagesService` class token)
  - `backend/src/modules/ikaros-discussions/ikaros-discussions.module.ts` (line 42 — stejný fix)
  - `backend/src/modules/ikaros-gallery/ikaros-gallery.module.ts` (line 28-29 — fix pro IkarosMessagesService + UploadService)
  - `backend/src/modules/search/search.module.ts` (line 32 — `PagesModule` přidán do imports)
  - `backend/src/modules/stats/stats.module.ts` (line 5 — `PagesModule` přidán do imports)
  - `backend/test/smoke-full-app.e2e-spec.ts` (nový — regression test pro full AppModule bootstrap)
- **Co bylo:** Po Fázi 6 finalizaci zůstaly 2 dluhy v Otevřené:
  1. **Schema decorator union types audit** — sweep ukázal, že **všech 21 výskytů** `@Prop({ default: null })` v `*.schema.ts` souborech **JIŽ** mělo explicit `type: ...`. Dluh byl nepřesný — Timeline + NpcTemplate opravy vyřešily problém, jen audit nikdy nezavřel záznam.
  2. **Plný AppModule e2e bootstrap selhával** — pokud doplníme audit testem, vyjevuje se dlouhotrvající skupina DI bugů:
     - 3 moduly (`IkarosArticles`, `IkarosDiscussions`, `IkarosGallery`) měly `{ provide: 'IkarosMessagesService', useExisting: 'IkarosMessagesService' }` — alias na sebe sama. `IkarosMessagesService` je v `IkarosMessagesModule` provideován jako class token, ne string. NestJS DI dropped silently přes `useExisting: <neexistující-string>`.
     - `IkarosGalleryModule` měl stejný bug i pro `UploadService`.
     - `SearchModule` (`@Global()`) injectoval `IPagesRepository` ale neimportoval `PagesModule`.
     - `StatsModule` injektoval `IPagesRepository` přes `StatsController` ale neimportoval `PagesModule` a neměl ani imports array.
- **Fix:**
  1. Schema audit: pouze cleanup záznamu v dluhy.md — žádný code change. Všechna union type pole už měla explicit `type`.
  2. 5 DI bugů opraveno:
     - `IkarosArticles/Discussions/Gallery.module.ts`: `useExisting: IkarosMessagesService` (class import) místo string aliasu na sebe.
     - `IkarosGalleryModule`: stejný fix pro `UploadService`.
     - `SearchModule.imports`: `PagesModule` přidán.
     - `StatsModule`: vytvořen `imports: [PagesModule]`.
  3. `smoke-full-app.e2e-spec.ts` přidán jako trvalý regression test (60s timeout kvůli ONNX model load v `EmbeddingSearchService.onModuleInit`). Ujistí, že DI bugy se nevrátí.
- **Verifikace:**
  - `npm run test:e2e` ✓ — **6 suites, 21/21 testů** (5 stávajících + 1 nový smoke-full-app)
  - `npm test` ✓ — 64 suites, 777/777 unit testů
  - `npm run lint:check` ✓ — 0 errors
- **Důsledek:** Plný AppModule lze nyní bootstrap-ovat v testech přes `createTestApp()` (bez `modules: [...]`). Selektivní variant zůstává jako rychlá alternativa pro fokusované suites (auth-refresh, worlds-join, game-events-role-gating). Oba modely jsou validní dle scope testu.

### 2026-05-07 — Fáze 6 finalizace (worlds-join PushModule, throttler test bypass, recipientName, maxWorkers)
- **Commit:** `910c513a`
- **Soubor:**
  - `backend/test/worlds-join.e2e-spec.ts` — `PushModule` přidán do modules; owner-membership upgrade na PJ; IkarosMessage assertion přes actionWorldId; 100ms timeout flush
  - `backend/test/helpers/app-factory.ts` — `APP_GUARD ThrottlerGuard` odstraněn pro test mode
  - `backend/test/jest-e2e.json` — `maxWorkers: 1` (mongodb-memory-server collisions)
  - `backend/src/modules/ikaros-messages/schemas/ikaros-message.schema.ts` — `recipientName` z `required: true` → `default: ''`
- **Co bylo:** 4 issues vyplynuly při běhu plné e2e suite napříč 5 testovacími soubory:
  1. **PushModule chyběl v worlds-join modules list** — po fixu `ChatModule → WorldsModule` cyklu (commit `91171800`) NestJS DI začalo resolveovat `PushService` (přímá závislost ChatService) a selhávalo.
  2. **ThrottlerGuard sdílel state napříč testy** — `@Throttle` decorators na `/auth/login` (5/min) a `/auth/register` (10/min) postupně shazovaly testy 429 protože in-memory ThrottlerStorage byl singleton.
  3. **mongodb-memory-server v paralelu** — Jest default `maxWorkers > 1` způsoboval binary/port collisions mezi suites; failure rate ~30 %.
  4. **`IkarosMessage.recipientName` validation fail** — production listener `IkarosMessagesService.handleJoinRequest` volal `recipientName: ''`, což `required: true` Mongoose validator odmítl. Dluh byl tichý — `try/catch` v event handler ho potlačoval, žádný IkarosMessage se neuložil ale uživatel nedostal error.
- **Fix:**
  1. `PushModule` přidán do `createTestApp({ modules: [...] })` v worlds-join. Plus owner-membership upgrade: `POST /worlds` automaticky vytvoří owner-membership s defaultní rolí — test ho updateOne na `WorldRole.PJ` aby ho `IkarosMessages.handleJoinRequest` listener filter (`role === PJ || PomocnyPJ`) zachytil.
  2. `app-factory.ts` v test mode neregistruje `APP_GUARD: ThrottlerGuard` → `@Throttle` decorators jsou no-op. Bez throttler interference je suite deterministická.
  3. `maxWorkers: 1` v `jest-e2e.json` natrvalo. Trade-off: 13s sekvenčně vs flaky paralelně.
  4. `recipientName` z `required: true` → `default: ''` v schema. Field zůstává v Mongo dokumentu, jen není validation gate. Read-time lookup z `users` collection může doplnit jméno (doporučeno do budoucna, mimo tuto fázi).
- **Verifikace:** `npm test` ✓ (760+ unit testů), `npm run test:e2e` ✓ (5/5 suites, 20/20 testů, 13s).

### 2026-05-07 — Fáze 6 Task 8 circular dep fix (ChatModule + WorldsModule exports)
- **Commit:** _(v commitu game-events-role-gating)_
- **Soubor:**
  - `backend/src/modules/chat/chat.module.ts` — `forwardRef(() => WorldsModule)` místo přímého importu
  - `backend/src/modules/worlds/worlds.module.ts` — přidáno `'IWorldSettingsRepository'` do exports
- **Co bylo:**
  1. `ChatModule` importoval `WorldsModule` přímo bez `forwardRef`, čímž rozbíjel Jest module loader v cyklu `WorldsModule → WorldWeatherModule → ChatModule → WorldsModule`. `worlds-join` i game-events e2e suite selhávaly s `module at index [1] of ChatModule "imports" is undefined`.
  2. `WorldsModule.exports` neobsahovalo `'IWorldSettingsRepository'`, i když `PagesService` (přes `forwardRef(() => WorldsModule)`) tuto závislost vyžaduje — způsobovalo `Can't resolve PagesService.IWorldSettingsRepository` při selektivním importu.
- **Fix:**
  1. `forwardRef(() => WorldsModule)` v `chat.module.ts:34` — kompletuje circular dep sadu (WorldWeatherModule→ChatModule byl fixnut dříve, toto je druhá polovina cyklu).
  2. `'IWorldSettingsRepository'` přidán do `worlds.module.ts:exports` — umožňuje PagesModule (forwardRef dependent) resolveovat provider.
- **Prevence:** Nové moduly s circular depem musí mít `forwardRef` oboustranně; exported providers musí zahrnovat vše co circular dependenti potřebují.

### 2026-05-06 — Fáze 6 Task 1 unblock (3 fixy)
- **Commit:** _(přidán s test commitem Fáze 6 Task 1)_
- **Soubor:**
  - `backend/src/modules/npc-templates/schemas/npc-template.schema.ts` (line 8 — explicit `type: String`)
  - `backend/test/jest-e2e.json` (`transformIgnorePatterns` přidán `meilisearch`)
  - `backend/src/modules/world-weather/world-weather.module.ts` (line 24 — `forwardRef(ChatModule)`)
  - `backend/test/helpers/app-factory.ts` (rozšíření o `modules?` parameter pro selektivní import)
- **Co bylo:** Tři pre-existing dluhy zablokovaly Fázi 6 Task 1 (vytváření `app-factory.ts` helper) a postupně se vyjevily jak se opravoval předchozí blocker:
  1. `NpcTemplateSchemaClass.worldId: string | null` — Mongoose union type bez explicit `type` (jeden z výskytů hlavního schema audit dluhu).
  2. `meilisearch` package je ESM-only — Jest nedokázal parsovat ESM `export` syntax kvůli `transformIgnorePatterns: ["node_modules/(?!(uuid)/)"]` whitelistu, který meilisearch nezahrnoval.
  3. Circular import `ChatModule → WorldsModule → WorldWeatherModule → ChatModule` — `WorldWeatherModule` importoval `ChatModule` napřímo místo přes `forwardRef`, což rozbilo Jest module loader (prod build funguje).
- **Fix:**
  1. `@Prop({ type: String, required: false, default: null })` na `worldId`. Funkčně beze změny.
  2. `"transformIgnorePatterns": ["node_modules/(?!(uuid|meilisearch)/)"]` v `jest-e2e.json`.
  3. `forwardRef(() => ChatModule)` ve `world-weather.module.ts:24` plus standardní komentář.
  4. **Plus** `app-factory.ts` rozšířen o `createTestApp({ modules: [...] })` selektivní import — Fáze 6 e2e suites neimportují plný AppModule, jen moduly co skutečně testují. Tím se obchází i případné další circular issues v Jest loaderu, aniž bychom museli auditovat celý import tree.
- **Verifikace:** `cd backend && npm run build` ✓, `npm run test:e2e -- --testPathPatterns=auth-throttle` ✓ (1/1 PASS), smoke test selektivního factory `createTestApp({ modules: [AuthModule, UsersModule] })` ✓ (2/2 PASS).
- **Pre-existing dluhy přetrvávají** (přesunuto do Otevřené):
  - Schema union types — audit ostatních `*.schema.ts` mimo Timeline/NpcTemplate
  - `app.e2e-spec.ts` plný AppModule bootstrap — momentálně řešitelné jen přes selektivní factory; reálná oprava vyžaduje audit circular import tree

### 2026-05-06 — Dávka 6 cleanup zbývajících (5 dluhů)
- **Commit:** _(přidán s feat commitem)_
- **Soubor:**
  - `backend/test/jest-e2e.json` (uuid transformIgnorePatterns)
  - `backend/test/auth-throttle.e2e-spec.ts` (drop `jest.mock('uuid')` workaround)
  - `backend/src/modules/timeline/schemas/timeline-event.schema.ts` (explicit `type` pro union types)
  - `backend/src/modules/world-calendar-config/world-calendar-config.controller.ts` (Swagger doc PUT full-replace)
  - `backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.repository.spec.ts` (nový integration test)
  - `backend/src/modules/search/repositories/page-embedding.repository.ts` (scale warning)
  - `backend/src/modules/push/repositories/push-subscription.repository.ts` (scale warning)
  - `backend/package.json` (+ `mongodb-memory-server@11.1.0` devDep)
  - `docs/dluhy.md` (sekce "Čeká na trigger", překlasifikace Rate limit Redis)
- **Co bylo:**
  1. **uuid ESM blokoval e2e**: workaround `jest.mock('uuid')` nutný v každém spec souboru.
  2. **WorldCalendarConfig PUT full-replace nebylo zdokumentováno** — klient může neúmyslně přepsat `hoursPerDay` na default 24.
  3. **DiarySchemaVersions concurrency neotestováno**: race condition v `findLastVersion + create N` pattern.
  4. **Unbounded find() bez observability**: `embedding.findByModelKey` (VPTree) a `pushSubscription.findAll` (notifyAll) musí vracet vše, ale neměli jsme alarm při bobtnání.
  5. **Rate limit Redis dluh nebyl opravitelný teď** — vyžaduje multi-instance deploy + Redis runtime.
- **Fix:**
  1. `jest-e2e.json: transformIgnorePatterns: ["node_modules/(?!(uuid)/)"]` — strukturální fix. Drop `jest.mock('uuid')` z auth-throttle. Plus opravena Timeline schema (`@Prop({ type: String/Number, default: null })` pro 3 union-type pole).
  2. Swagger doc `@ApiOperation({ description: 'PUT je full-replace upsert. Všechna pole musí být v requestu.' })` + 404 response.
  3. `mongodb-memory-server` instalován jako devDep. 4 integration testy (compound unique, paralelní create same version → E11000, různé worldId same version OK, race-prone `findLastVersion + create`). Použit `model.collection.insertOne` místo `model.create` kvůli kolizi field name `schema` s Mongoose internal.
  4. `MongoPageEmbeddingRepository.findByModelKey`: warn log při >10000 docs. `MongoPushSubscriptionRepository.findAll`: warn log při >1000 subs. Bez breaking changes — observability dodá alarm dlouho před skutečným problémem.
  5. Vytvořena nová sekce `## Čeká na trigger` v dluhy.md. Rate limit Redis přesunut s explicitním triggerem "multi-instance deploy". Distinkce: Otevřené = teď to pal, Čeká na trigger = legitní budoucí práce, Vyřešené = audit.
- **Verifikace:** `tsc --noEmit` ✓, `lint:check` ✓ (0 errors), unit jest ✓ (775/775 passed, +4 nové DiarySchemaVersions integration), e2e auth-throttle ✓ (1/1, bez `jest.mock('uuid')` workaround).
- **Pre-existing dluh re-flagován:** `app.e2e-spec.ts` schema decorator union types — Timeline opraveno, ale problém přetrvává v `npc-templates` a dalších. Strukturální audit všech `*.schema.ts` zbývá. Detail v Otevřené.

### 2026-05-06 — Dávka 5 test coverage (3 dluhy)
- **Commit:** _(přidán s feat commitem)_
- **Soubor:**
  - `backend/test/auth-throttle.e2e-spec.ts` (nový)
  - `backend/scripts/migrate-world-news/bulk-write.ts` (nový), `bulk-write.spec.ts` (nový), `index.ts` (refactor)
- **Co bylo:**
  1. **Rate limit smoke test chyběl** — TS+lint+unit prošlo, ale runtime chování throttleru přes HTTP nebylo ověřeno.
  2. **WorldNews migrate idempotent test chyběl** — `mapper.spec.ts` testuje mapping, ale skript `index.ts` (`bulkWrite replaceOne upsert`) neměl test pro idempotentnost (`filter: { _id }` correctness).
  3. **WorldCalendarConfig controller spec chyběl** — spec uváděl 3 controller testy (401/403/200), implementace měla jen service spec.
- **Fix:**
  1. `auth-throttle.e2e-spec.ts` — izolovaný supertest scénář s mocknutým `AuthService`. 5× POST `/auth/login` (401), 6. dostane 429. Per-IP throttler verifikován end-to-end.
  2. Extrakce `buildBulkWriteOp(item)` z `index.ts` do `bulk-write.ts` (separátní modul, aby test neimport `main()` runner). 6 testů: filter._id ObjectId conversion, upsert: true, replacement._id consistency, idempotence (2× volání = stejný hex), různé _id rozlišené, throw na invalid ObjectId.
  3. Zavřeno s odůvodněním — "buď přidat nebo nechat konzistentní s ostatními moduly" — implementace zvolila konzistenci (stejně jako WorldNews/Timeline). Žádný code change.
- **Verifikace:** `tsc --noEmit` ✓, `lint:check` ✓ (0 errors), full unit jest suite ✓ (771/771 passed, +6 nových bulk-write testů), e2e auth-throttle ✓ (1/1).

### 2026-05-06 — Dávka 4 strategická rozhodnutí (5 dluhů)
- **Commit:** _(přidán s feat commitem)_
- **Soubor:**
  - `.claude/rules/auth-leak-policy.md` (nový)
  - `backend/src/modules/timeline/timeline.service.ts` + spec (1 test status update)
  - `backend/src/modules/world-calendar-config/world-calendar-config.service.ts` + spec (1 test)
  - `backend/src/modules/world-weather/world-weather.service.ts` + spec (1 test)
  - `backend/src/modules/ikaros-news/schemas/ikaros-news.schema.ts`, `interfaces/ikaros-news.interface.ts`, `ikaros-news.service.ts` + spec (4 nových testů), `ikaros-news.controller.ts`, `repositories/ikaros-news.repository.ts`
  - `docs/superpowers/plans/2026-05-04-krok-10cd-timeline-calendar-config.md` (year permisivita)
  - `docs/superpowers/plans/2026-05-03-krok-7d-rpg-system-presets.md` (preset labely)
- **Co bylo:**
  1. **404 vs 403 nekonzistence**: Timeline/WorldCalendarConfig/WorldWeather `assertCanWrite` vracely 403 pro neexistující svět (anti-leak per WorldNews precedent), zatímco WorldCurrencies, Calendars (po dávce 3), Calendar 4.1 vracely 404. Žádné explicitní pravidlo.
  2. **Timeline findById timing leak**: 404 neexistuje vs 403 cross-world — útočník přes status rozliší existenci eventu.
  3. **ikaros-news authorName denormalizace**: schema ukládá `authorId` + `authorName` zároveň. Rename usera → staré dokumenty mají staré jméno.
  4. **Timeline year permisivita**: DTO/schema neomezují `year` (záporné OK), spec to explicitně neříkal.
  5. **Mezinárodní RPG presety**: Shadowrun/GURPS/CoC/Fate mají anglické labely vs. spec preference češtiny.
- **Fix:**
  1. Vytvořeno `.claude/rules/auth-leak-policy.md` — pravidlo: anonymní endpointy → **403** anti-leak, auth-required → **404** neexistuje / **403** ne-tvůj. WorldNews výjimka (celý modul anti-leak — anonymní reads). Timeline/WorldCalendarConfig/WorldWeather `assertCanWrite` přepsáno z 403 na 404 + 3 testy update.
  2. Per nové pravidlo (auth-required) je 404 + 403 distinkce **správné chování**, ne leak. Dluh zavřen s odůvodněním — žádný code change.
  3. `authorName` v schematu označen `required: false` (legacy fallback). `IkarosNewsService.findAll/create` joinne `username` z `IUsersRepository.findById` (deduplikace per unikátní authorId, ~1 query). Fallback na legacy `authorName` z DB pro smazané usery, jinak prázdný string. Žádná migrace — staré záznamy zachovají snapshot. Nové: response API zachovává `authorName` field, ale joinný. `IkarosNewsResponse` interface oddělená od `IkarosNewsItem` (DB).
  4. Update spec — záporné roky explicitně povoleny pro fantasy "BC era". Žádný code change (DTO byl už permisivní).
  5. Update spec — mezinárodní RPG si zachovají anglické labely (community standard "essence", "edge", "Sanity"). CZ-specifické (Dračí doupě, ASF) zůstávají v češtině. Žádný code change.
- **Verifikace:** `tsc --noEmit` ✓, `lint:check` ✓ (0 errors), full jest suite ✓ (765/765 passed, +3 nové testy v ikaros-news).

### 2026-05-06 — Dávka 3 perf + auth (4 dluhy)
- **Commit:** _(přidán s feat commitem)_
- **Soubor:**
  - `backend/src/modules/chat/chat.service.ts`
  - `backend/src/modules/calendars/calendars.service.ts` + `calendars.controller.ts` + `calendars.service.spec.ts`
- **Co bylo:**
  1. **N+1 query v `chat.service.resolveChannelRecipients`**: pro každého aktivního člena světa se volal `hasChannelAccess`, který znovu `findByUserAndWorld` (1 query/člen). Pro svět s M členy: `1 + M` queries.
  2. **CalendarsService bez Admin/Superadmin shortcut**: globální Admin bez membership světa dostal 403 místo 200 (spec 5.2 chce shortcut).
  3. **CalendarsService bez 404 anti-leak**: neexistující svět vracel 403 (membership null) — neodlišil "ne tvůj svět" od "neexistuje". Spec a ostatní moduly (Timeline, Calendar 4.1) mají explicit `worldsRepo.findById` → 404.
  4. **Chybějící testy**: spec ~14 testů, impl mělo 10. Chyběly: Admin shortcut, cross-world, 404 slug, 404 anti-leak.
- **Fix:**
  1. Extract privátní `hasAccessGivenMembership(channel, userId, membership)` helper. `resolveChannelRecipients` použije membership z `findByWorldId` výsledku → 0 dalších DB hitů. Veřejné `hasChannelAccess` zachováno (delegate na helper).
  2. Změna sign: `aggregate(worldId, requester: RequestUser)`, `updateSettings(...,requester)`. Privátní `assertCanModerate(worldId, requester)` má `if (requester.role <= UserRole.Admin) return;` shortcut. Controller předává `user` místo `user.id`.
  3. Inject `'IWorldsRepository'` (z WorldsModule). `assertCanModerate` po Admin shortcut volá `worldsRepo.findById(worldId)` → throw `NotFoundException('Svět nenalezen')`.
  4. Spec rozšířen z 10 na 17 testů: Admin shortcut (aggregate + updateSettings), Superadmin shortcut, 404 anti-leak (aggregate + updateSettings), 404 neexistující slug, cross-world W1/W2.
- **Verifikace:** `tsc --noEmit` ✓, `lint:check` ✓ (0 errors), full jest suite ✓ (762/762 passed, +7 nových).

### 2026-05-06 — Dávka 2 observability/error handling (3 dluhy)
- **Commit:** _(přidán s feat commitem)_
- **Soubor:**
  - `backend/src/modules/pages/pages.service.ts`, `stats/stats.controller.ts`, `global-chat/global-chat.service.ts`, `global-chat/global-chat.gateway.ts`, `ikaros-news/ikaros-news.service.ts`
  - `backend/src/modules/chat/chat.service.ts`
  - `backend/src/modules/world-calendar-config/world-calendar-config.service.ts` + spec
- **Co bylo:**
  1. Fire-and-forget `void promise` calls: 7 míst (3× pages search index, stats rebuild, global-chat push, global-chat whisper, ikaros-news push). Některé bez `.catch` (rejectů zmizely), některé s `.catch(() => undefined)` (silent swallow horší než nic).
  2. ChatService.createSystemMessage — silent return při neexistujícím/cross-world channel. WorldWeatherService.broadcast neměl jak zjistit selhání.
  3. WorldCalendarConfig — sluneční těleso s `months: []` projde validací (`0 === 0`). Runtime produkuje `"vychod: undefined:00"`.
- **Fix:**
  1. Přidán `Logger` do PagesService, StatsController, GlobalChatService, GlobalChatGateway, IkarosNewsService. Každý `void promise` má `.catch((err: unknown) => this.logger.warn/error('...', err))`.
  2. ChatService.createSystemMessage vrhá `NotFoundException('Kanál nenalezen')` — propaguje na 404 přes WorldWeather.broadcast (per spec).
  3. Přidán explicit check `if (monthCount < 1) throw BadRequestException(...)` před SunConfig délkovým checkem. Doplněn 1 spec test.
- **Verifikace:** `tsc --noEmit` ✓, `lint:check` ✓ (0 errors), jest 12 modulů ✓ (191 passed včetně nového sun-bez-měsíců testu).

### 2026-05-06 — Dávka 1 quick wins (6 dluhů)
- **Commit:** _(přidán s feat commitem)_
- **Soubor:**
  - `backend/src/modules/world-weather/dto/set-current-weather.dto.ts`
  - `backend/src/modules/world-weather/schemas/weather-generator.schema.ts`
  - `backend/src/modules/timeline/dto/celestial-override.dto.ts` (nový), `create-timeline-event.dto.ts`, `update-timeline-event.dto.ts`
  - `backend/scripts/migrate-world-news/mapper.ts`
  - `backend/src/database/database.module.ts`
  - `backend/src/common/constants/time.constants.ts` (nový), `game-events/game-event-cleanup.job.ts`, `game-events/game-event-reminder.job.ts`, `global-chat/clean-messages.job.ts`, `global-chat/global-chat.service.ts`, `global-chat/cleanup-inactive-users.job.ts`, `presence/presence.service.ts`, `auth/auth.service.ts`
- **Co bylo:**
  1. WorldWeather `SetCurrentWeatherDto.tempUnit` mělo `@IsString()` místo `@IsIn(['C','F'])` — klient mohl poslat libovolný string.
  2. WeatherGenerator schema mělo `@Prop({ index: true })` na `worldId` plus explicit `WeatherGeneratorSchema.index({ worldId: 1 })` — duplicitní index.
  3. Timeline `CelestialOverrideDto` byl definován duplicitně v create i update DTO.
  4. WorldNews migrate `mapper.ts` používal `null as unknown as WorldNewsType` cast jako dead path — code smell.
  5. `DatabaseModule` neměl production guard — bez `MONGODB_URI` se v produkci tiše připojil na localhost.
  6. Magic ms čísla (`24 * 60 * 60 * 1000` apod.) opakované v jobech a service.
- **Fix:**
  1. `@IsString() @IsNotEmpty()` → `@IsIn(['C', 'F'])` na `tempUnit`.
  2. Drop `index: true` z `@Prop`, ponechán explicit single-field index.
  3. Extract do `dto/celestial-override.dto.ts`, oba DTO importují.
  4. Refactor ternary na if/else if/else s explicit error return — žádný dead cast.
  5. Pokud `NODE_ENV === 'production'` a `MONGODB_URI` chybí → throw při bootu. Dev fallback na `mongodb://localhost:27017/ikaros` zachován.
  6. Centrální `common/constants/time.constants.ts` (`SECOND_MS`, `MINUTE_MS`, `HOUR_MS`, `DAY_MS`, `HOURS_2_MS/23_MS/25_MS`). 7 souborů přepsáno.
- **Verifikace:** `tsc --noEmit` ✓, `npm run lint:check` ✓ (0 errors), `jest` na 11 modulech ✓ (214 passed), mapper spec ✓ (12 passed).

### 2026-05-06 — Username whitespace explicitně povolen
- **Commit:** _(přidán s docs commitem)_
- **Soubor:** —
- **Co bylo:** Nalezeno při audit fáze case-insensitive migration: `Yamada Shiro` má mezeru v username. Žádná validace whitespace v register DTO ani schema.
- **Rozhodnutí:** Whitespace v username **explicitně povolen** — žádná validace, žádná migrace. Username může obsahovat mezeru jako legitimní volba (`Yamada Shiro`, fantasy jména s mezerami atp.). Klienti používají URL encoding na endpointech (`/users/exists/Yamada%20Shiro`).

### 2026-05-06 — Username case-insensitive lookup (`usernameLower` index)
- **Commit:** _(přidán s feat commitem)_
- **Soubor:** `backend/src/modules/users/schemas/user.schema.ts`, `users.repository.ts`, `users.service.ts`, `interfaces/users-repository.interface.ts`, `users.repository.spec.ts`, `users.service.spec.ts`
- **Co bylo:** `Karel` a `karel` byli různí uživatelé. Registrace varianty existujícího jména prošla, login se rozbil na case mismatch. `exists` endpoint case-sensitive.
- **Fix:** Přidán `usernameLower: string` field s unique index do User schema. Repository: `findByUsername` query přes `usernameLower` (input → toLowerCase). `save`/`update` derive `usernameLower` z `username`. `username` (display case) zachován pro UI/JWT.
- **Migration:** `UsersService.onModuleInit` při bootu (1) detekuje case-konflikty `findUsernameCaseConflicts` → log + abort pokud existují, (2) backfilluje `usernameLower` pro pre-migration záznamy. Idempotentní. Pre-flight check ~30 existujících users (manuálně zkontrolováno) — žádné konflikty.
- **JWT kontrakt:** beze změny (pořád obsahuje case-as-stored `username`).

### 2026-05-06 — Rate limiting na anon a auth endpointy
- **Commit:** _(přidán s feat commitem)_
- **Soubor:** `backend/src/app.module.ts` (ThrottlerModule + APP_GUARD), `backend/src/modules/auth/auth.controller.ts`, `backend/src/modules/users/users.controller.ts`
- **Co bylo:** Žádný throttler — user enumeration na `exists`, brute-force risk na `/auth/login` a `/auth/register`. Refresh token endpoint bez ochrany.
- **Fix:** `@nestjs/throttler` global default 100/min/IP. Per-endpoint custom: `/auth/login` 5/min, `/auth/register` 10/min, `/auth/refresh` 30/min, `/users/exists` 30/min. Per-IP, in-memory.
- **Otevřené follow-upy:** (1) in-memory storage neřeší multi-instance scaling — pro production scale s víc replikami chce Redis-backed throttler. (2) Žádný integration smoke test (TS+lint+unit testy prošly = setup je validní, ale runtime chování netestováno přes HTTP).

### 2026-05-06 — Lint dluh (3322 problémů → 0 errors / 147 warnings)
- **Commity:** `d14abe62` (fáze A: prettier sweep + .gitattributes), `39456a20` (fáze B: B1+B2+B3)
- **Soubor:** mnoho (`backend/src/**`), `backend/eslint.config.mjs`, `.gitattributes` (nový)
- **Co bylo:** Dluh v logu byl označen jako "231 lint errorů", reálný stav byl **3322** problémů. 91 % byl pre-existing prettier formátovací dluh — codebase nikdy nebyl auto-formátován. Zbylých ~215 byly skutečné TS-eslint chyby (no-unsafe-*, unused-vars, unbound-method).
- **Fix:**
  - **Fáze A (`d14abe62`):** `.gitattributes` (eol=lf), prettier `endOfLine: "lf"`, `npm run lint -- --fix` zformátoval celý backend (3027/3322 chyb deterministicky vyřešeno)
  - **Fáze B (`39456a20`):** 35 unused-vars vyčištěno (drop importů, prefix `_`), 5 floating-promises → `void`, 9 require-await → mockImplementation/eslint-disable s důvodem, 25 unbound-method (2 production fix, 23 přes eslint override pro `*.spec.ts`), no-unsafe-* downgradeno na `warn`
- **Prevence:** `npm run lint:check` přidán do husky pre-commit a GitHub Actions CI. CI teď chytí regresi 0-errorů.

### 2026-05-06 — Tichý build dluh: `getPresence` v global-chat
- **Commit:** `3a35818e`
- **Soubor:** `backend/src/modules/global-chat/global-chat.{gateway,service,service.spec}.ts`
- **Co bylo:** `global-chat.controller.ts:43` volal `gateway.getPresence()`, ale metoda na committed gateway neexistovala. `tsc --noEmit` failoval, jest pass (mocky duck-typed). Implementace whisper feature zůstala na lokálním stroji jen jako WIP — controller byl committed bez gateway protějšku.
- **Fix:** Dotažena implementace whispers + presence v gateway/service (`getPresence`, `handleWhisper`, `sendWhisper`, `userId` v `connectedUsers`).
- **Prevence:** Husky pre-commit hook (`f74ad5ad`) by tohle chytil — pravděpodobně byl bypassnutý `--no-verify` nebo nebyl nainstalovaný v té době. Žádný strukturální fix tu není.

### 2026-05-06 — Prázdná junk složka v rootu repa
- **Commit:** `d14abe62` (smazáno před commit fáze A)
- **Soubor:** `c:MatrixProjektIkarosProjekt-ikarosbackendsrcmodulesnpc-templatesrepositories/` (root)
- **Co bylo:** Prázdná složka, jejíž název byl Windows path bez separátorů (vznikla pravděpodobně neescapovaným argumentem do `mkdir`/`New-Item` 2026-05-02).
- **Fix:** `rmdir` (byla úplně prázdná, žádný obsah).

### 2026-05-06 — Chybějící required pole v test mockech (chat/global-chat)
- **Commit:** `28c80134`
- **Soubor:** `backend/src/modules/chat/chat.service.spec.ts`, `backend/src/modules/global-chat/global-chat.service.spec.ts`
- **Co bylo:** Po Fázi 2.2 (chat fields, `3aab8fce`) se přidaly required pole `ChatChannel.type`, `ChatMessage.customFont/color/isDiceRoll` a `IChatMessageRepository.pruneChannel`, ale test fixtures nebyly aktualizovány. Jest procházel (mocky duck-typed), `tsc --noEmit` selhával — tichý build dluh.
- **Fix:** Doplněno do mocků v obou spec souborech.
- **Prevence:** Husky pre-commit hook + GitHub Actions CI (`f74ad5ad`) — tsc gate před commitem i před mergem PR.

### 2026-05-06 — Unused `world` var v `updateCalendarConfig`
- **Commit:** `704b7118`
- **Soubor:** `backend/src/modules/worlds/worlds.service.ts:205`
- **Co bylo:** Vlastní lint warning při Fázi 2.4 — `const world = await this.findById(...)` byl unused, sloužil jen jako 404-trigger.
- **Fix:** Drop `const world = `, ponecháno `await this.findById(...)`.

### 2026-05-06 — Duplikátní řádky v `IWorldsRepository`
- **Commit:** `7f74e6cb`
- **Soubor:** `backend/src/modules/worlds/interfaces/worlds-repository.interface.ts`
- **Co bylo:** Pre-existing dluh — `existsBySlug` a `increment` byly v interface uvedeny dvakrát.
- **Fix:** Odstraněny duplikátní řádky.

### 2026-05-06 — `canAdminWorld` ownerId shortcut (vlastník ≠ PJ)
- **Commit:** `59fa8ec4`
- **Soubor:** `backend/src/modules/worlds/worlds.service.ts`
- **Co bylo:** Autorizace dovolovala vlastníka světa (`world.ownerId === requester.id`) i bez PJ membershipu. V rozporu s pravidlem "vlastník ≠ PJ" stanoveným pro Fázi 2.4. Bonus: `updateMemberFree:233` měl security smell — předával target's membership jako requesterovo.
- **Fix:** Drop ownerId shortcut z `canAdminWorld`. 6 callerů (`softDelete`, `leave`, `updateMember*`) fetchuje requesterovo membership. `updateMemberFree` opraven. Sémantická kontrola "vlastník nemůže opustit svůj svět" v `leave()` zachována (business pravidlo, ne autorizace).
- **Prevence:** Memory záznam `project_world_authorization.md`, 2 nové testy (`deny owner without membership`).
