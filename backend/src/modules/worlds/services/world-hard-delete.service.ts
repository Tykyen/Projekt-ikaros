import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

/**
 * Kolekce keyed přímo `worldId` — smažou se `deleteMany({ worldId })`.
 * Soupis odvozen z grepu `worldId` přes schémata všech modulů (2026-06-08).
 * ⚠️ Při přidání nového world-scoped modulu DOPLNIT sem (jinak orphaned data
 * po hard-delete světa). `users` ZÁMĚRNĚ chybí — není world-scoped.
 */
const WORLD_SCOPED_COLLECTIONS = [
  // pages + postavy
  'pages',
  'characters',
  'character_accounts',
  'character_calendars',
  'character_diaries',
  // bestiář
  'bestiae',
  // kampaň (pavučina, obchod, scénáře)
  'campaignChangeLogs',
  'campaignPurchases',
  'campaignQuickNotes',
  'campaignRelationships',
  'campaignScenarios',
  'campaignShopGroups',
  'campaignShopItems',
  'campaignStorylines',
  'campaignSubjects',
  // chat
  'chatchannels',
  'chatgroups',
  'chatmessages',
  'scheduledMessages',
  // mapy
  'dungeonMaps',
  'mapOperations',
  'mapScenes',
  'worldMaps',
  'universeMaps',
  // čas / kalendáře / novinky / timeline
  'world_calendar_configs',
  'worldnews',
  'timeline_events',
  'game_events',
  // počasí
  'world_custom_weather_presets',
  'world_weather_generator_sets',
  'world_weather_generators',
  'world_weather_history',
  // ostatní world-scoped
  'custom_emotes',
  'sounds',
  'world_currencies',
  'world_gm_notes',
  'world_page_templates',
  'worldaccessrequests',
  'worldmemberships',
  'worldOperations',
  'worldsettings',
];

/**
 * Subdoc kolekce keyed `characterId` (NEMAJÍ `worldId`) — smažou se podle
 * charakterů světa, ne podle worldId.
 */
const CHARACTER_KEYED_COLLECTIONS = [
  'character_finances',
  'character_inventories',
  'character_notes',
];

/**
 * Trvalé (hard) smazání světa + VŠECH jeho dat. Volá `WorldCleanupCron` po
 * vypršení 30denního recovery okna. Centralizovaný cascade (1 seznam kolekcí)
 * místo per-modul `@OnEvent` handlerů — méně DI, jeden zdroj pravdy.
 */
@Injectable()
export class WorldHardDeleteService {
  private readonly logger = new Logger(WorldHardDeleteService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async hardDelete(worldId: string): Promise<void> {
    // 1) subdocy bez worldId — najdi charaktery světa, smaž jejich finance/výbavu/poznámky.
    const charDocs = await this.connection
      .collection('characters')
      .find({ worldId }, { projection: { _id: 1 } })
      .toArray();
    const charIds = charDocs.map((c) => String(c._id));
    if (charIds.length > 0) {
      for (const coll of CHARACTER_KEYED_COLLECTIONS) {
        await this.safeDelete(coll, { characterId: { $in: charIds } });
      }
    }

    // 2) všechny world-scoped kolekce.
    for (const coll of WORLD_SCOPED_COLLECTIONS) {
      await this.safeDelete(coll, { worldId });
    }

    // 3) samotný world dokument.
    if (Types.ObjectId.isValid(worldId)) {
      await this.safeDeleteWorld(worldId);
    }

    this.logger.log(
      `World ${worldId} hard-deleted (cascade ${WORLD_SCOPED_COLLECTIONS.length} kolekcí + ${CHARACTER_KEYED_COLLECTIONS.length} subdoc, ${charIds.length} postav)`,
    );
  }

  private async safeDelete(
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.connection.collection(collection).deleteMany(filter);
    } catch (err) {
      // Jedna selhaná kolekce nesmí zastavit zbytek cascade.
      this.logger.error(
        `hardDelete: kolekce ${collection} selhala: ${(err as Error).message}`,
      );
    }
  }

  private async safeDeleteWorld(worldId: string): Promise<void> {
    try {
      await this.connection
        .collection('worlds')
        .deleteOne({ _id: new Types.ObjectId(worldId) });
    } catch (err) {
      this.logger.error(
        `hardDelete: world dokument ${worldId} selhal: ${(err as Error).message}`,
      );
    }
  }
}
