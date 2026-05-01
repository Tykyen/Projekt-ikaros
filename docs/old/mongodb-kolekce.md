# MongoDB kolekce — Matrix Backend

Databáze: `MatrixDatabase`

Celkem: **37 kolekcí**.

## MongoDBSettings model

Třída `matrixBackend.Models.MongoDBSettings`. Binduje se z konfigurace přes Options pattern (`MongoDBSettings` sekce v appsettings).

Pole s výchozí hodnotou v kódu nejsou povinná v appsettings.json — používají hardcoded default.

---

## Seznam kolekcí

| Vlastnost | Název kolekce | Zdroj | Popis |
|---|---|---|---|
| `UsersCollectionName` | `Users` | appsettings | Uživatelské účty |
| `PagesCollectionName` | `Pages` | appsettings | Wiki stránky |
| `CharactersCollectionName` | `Characters` | appsettings | Postavy hráčů |
| `CalendersCollectionName` | `Calenders` | appsettings | Ingame kalendáře |
| `MessagesCollectionName` | `Messages` | appsettings | Obecné zprávy |
| `ChatMessagesCollectionName` | `ChatMessages` | appsettings | Zprávy herního chatu |
| `ChatChannelsCollectionName` | `ChatChannels` | appsettings | Kanály chatu |
| `PageEmbeddingsCollectionName` | `PageEmbeddings` | appsettings | ONNX embedding vektory stránek |
| `SearchStatsCollectionName` | `SearchStats` | appsettings | Statistiky vyhledávání |
| `FailedIndexingsCollectionName` | `FailedIndexings` | appsettings | Záznamy o selhání indexace stránek |
| `GameEventsCollectionName` | `GameEvents` | appsettings | Herní události (plánované i minulé) |
| `NewsCollectionName` | `News` | appsettings | Novinky hry Matrix |
| `TimelineEventsCollectionName` | `TimelineEvents` | appsettings | Události na časové ose |
| `ChannelReadStatusCollectionName` | `ChannelReadStatuses` | appsettings | Stav přečtení kanálů pro uživatele |
| `MapScenesCollectionName` | `MapScenes` | appsettings | Scény herních map |
| `NpcTemplatesCollectionName` | `NpcTemplates` | appsettings | Šablony NPC postav |
| `MapTemplatesCollectionName` | `MapTemplates` | appsettings | Šablony map |
| `SoundsCollectionName` | `sounds` | default v kódu | Zvukové soubory / reference |
| `WorldsCollectionName` | `Worlds` | default v kódu | Herní světy |
| `WorldMembershipsCollectionName` | `WorldMemberships` | default v kódu | Členství uživatelů ve světech |
| `IkarosNewsCollectionName` | `IkarosNews` | default v kódu | Novinky platformy Ikaros |
| `IkarosMessagesCollectionName` | `IkarosMessages` | default v kódu | Zprávy Ikaros chatu |
| `IkarosDiscussionsCollectionName` | `IkarosDiscussions` | default v kódu | Diskuzní vlákna Ikaros |
| `IkarosDiscussionPostsCollectionName` | `IkarosDiscussionPosts` | default v kódu | Příspěvky v diskuzích Ikaros |
| `IkarosArticlesCollectionName` | `IkarosArticles` | default v kódu | Články platformy Ikaros |
| `IkarosGalleryCollectionName` | `IkarosGallery` | default v kódu | Galerie obrázků Ikaros |
| `PushSubscriptionsCollectionName` | `PushSubscriptions` | default v kódu | Web Push subscriptions uživatelů |
| `CampaignSubjectsCollectionName` | `CampaignSubjects` | default v kódu | Subjekty (postavy, místa, věci) kampaní |
| `CampaignRelationshipsCollectionName` | `CampaignRelationships` | default v kódu | Vztahy mezi subjekty kampaní |
| `CampaignStorylinesCollectionName` | `CampaignStorylines` | default v kódu | Dějové linky kampaní |
| `CampaignQuickNotesCollectionName` | `CampaignQuickNotes` | default v kódu | Rychlé poznámky GM ke kampani |
| `CampaignShopItemsCollectionName` | `CampaignShopItems` | default v kódu | Položky obchodu v kampani |
| `CampaignScenariosCollectionName` | `CampaignScenarios` | default v kódu | Scénáře kampaní |
| `WorldPagesCollectionName` | `WorldPages` | default v kódu | Wiki stránky konkrétního světa |
| `WorldSettingsCollectionName` | `WorldSettings` | default v kódu | Nastavení světa |
| `UniversesCollectionName` | `Universes` | default v kódu | Univerza (nadřazená vrstva nad světy) |
| *(MessagesCollectionName)* | `Messages` | appsettings | Viz výše — obecné zprávy (vlastnost v appsettings, ne v C# modelu) |

> Poznámka: `MessagesCollectionName` je v appsettings.json, ale není explicitně deklarována jako vlastnost v `MongoDBSettings.cs`. Pravděpodobně legacy nebo používána přímým přístupem přes `IConfiguration`.
