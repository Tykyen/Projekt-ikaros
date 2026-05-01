# Middleware pipeline a Dependency Injection — Matrix Backend

## Middleware pipeline

Pořadí je závazné:

1. **Swagger + SwaggerUI** — pouze v `Development` prostředí
2. **UseCors("AllowFrontend")** — musí být před autentifikací
3. **UseResponseCompression** — musí být před autentifikací (viz sekce Komprese)
4. **UseAuthentication** — JWT Bearer
5. **UseAuthorization** — autorizace na základě claims
6. **UseHttpsRedirection** — pouze mimo `Development`
7. **MapControllers** — REST API
8. **MapHub\<ChatHub\>("/api/chatHub")** — herní chat
9. **MapHub\<MapHub\>("/api/mapHub")** — real-time mapy
10. **MapHub\<IkarosChatHub\>("/api/ikarosChatHub")** — chat platformy Ikaros

---

## Dependency Injection

Všechny služby jsou **Singleton** (pokud není uvedeno jinak).

### Infrastruktura / framework

| Registrace | Popis |
|---|---|
| `IMongoClient` → `MongoClient` | Připojení z `MongoDBSettings:ConnectionString` |
| `IMongoDatabase` | Databáze `MatrixDatabase` |
| `SignalR` | `AddSignalR()` s vlastními options (viz níže) |
| `Authentication("Bearer")` | JWT Bearer |
| CORS `"AllowFrontend"` | Origins z konfigurace + `https://localhost:5173` napevno |
| Response Compression | Brotli + GZip |
| Swagger + EndpointsApiExplorer | Jen Development |

### Options (konfigurace)

| Třída | Sekce v appsettings |
|---|---|
| `MongoDBSettings` | `MongoDBSettings` |
| `SearchSettings` | `Search` |
| `JwtSettings` | `JwtSettings` |
| `VapidSettings` | `VapidSettings` |

### Aplikační služby

| Služba | Popis |
|---|---|
| `JwtService` | Generování a validace JWT tokenů |
| `GoogleDriveService` | Integrace s Google Drive API |
| `ChatMessagesService` | Správa zpráv chatu |
| `ChatChannelsService` | Správa kanálů chatu |
| `ChatGroupsService` | Správa skupin chatu + seed výchozích skupin při startu |
| `PushSubscriptionService` | Správa Web Push subscriptions |
| `WebPushService` | Odesílání Web Push notifikací |
| `UserService` | Správa uživatelů |
| `PagesService` | Správa stránek (wiki) |
| `CharacterService` | Správa postav |
| `CalenderService` | Správa ingame kalendářů |
| `GameEventsService` | Správa herních eventů |
| `TimelineEventsService` | Správa událostí časové osy |
| `NewsService` | Správa novinek |
| `StatsService` | Statistiky |
| `MapsService` | Správa map |
| `SoundsService` | Správa zvuků |
| `WorldService` | Správa světů + seed Matrix světa při startu |
| `CampaignService` | Správa kampaní |
| `UniverseService` | Správa univerz |
| `EmotesService` | Správa emote |

### Vyhledávání

| Registrace | Popis |
|---|---|
| `ISearchService` → `EmbeddingSearchService` | Sémantické vyhledávání přes ONNX embeddingy |
| `ISearchService` → `LuceneSearchService` | Full-text vyhledávání přes Lucene.NET |
| `ISearchCoordinator` → `SearchCoordinator` | Koordinátor obou providerů |

`ISearchCoordinator` je inicializován ihned po buildu (eager init) — indexování stránek začíná okamžitě po spuštění serveru.

Zakomentováno (neaktivní): `GameEventCleanupService` (hosted service).

---

## SignalR konfigurace

```csharp
options.MaximumReceiveMessageSize = 5 * 1024 * 1024; // 5 MB
options.EnableDetailedErrors = true;
```

Limit 5 MB nastaven kvůli přenosu velkých hex polí (data herních map).

Autentifikace SignalR: standardní JWT Bearer — stejná jako pro REST API. `MapInboundClaims = false` zabraňuje přemapování standardních JWT claim názvů.

---

## Komprese

Aktivní pro HTTP i HTTPS (`EnableForHttps = true`).

Komprimované MIME typy: výchozí sada + `application/json`.

| Provider | Algoritmus | Level |
|---|---|---|
| `BrotliCompressionProvider` | Brotli | `Fastest` |
| `GzipCompressionProvider` | GZip | `Fastest` |

Snížení velikosti JSON payloadu ~70–80 %. Middleware `UseResponseCompression` musí být před `UseAuthentication`.

---

## CORS

Politika `AllowFrontend`: povoluje libovolné hlavičky, libovolné metody, credentials.

Povolené origins:
- `https://www.projekt-ikaros.com`
- `http://localhost:5173`
- `http://localhost:5174`
- `https://localhost:5173` (přidán napevno v kódu)
