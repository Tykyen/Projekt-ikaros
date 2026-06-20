import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  // CD-RUN-5 (plný audit 2026-06-20) — 13.4 obrázkový atlas: dřív orphan po
  // hard-delete světa (chyběly v listu).
  'worldMapEntries',
  'worldMapFolders',
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
  // CD-RUN-6 (plný audit 2026-06-20) — per-svět verze deníkového schématu.
  'diary_schema_versions',
  'worldaccessrequests',
  'worldmemberships',
  'worldOperations',
  'worldsettings',
];

/**
 * CD-RUN-7..12 (plný audit 2026-06-20) — world-scoped kolekce nesoucí Cloudinary
 * blob URL. Před hard-delete je posbíráme a emitneme `media.orphaned`, jinak
 * bloby (emoty/avatary/scény/ikony/bestie/atlas) leakují na Cloudinary navždy.
 * (Dřív se čistil jen `world.imageUrl` přes CD-03.)
 */
const BLOB_COLLECTIONS: Record<string, string[]> = {
  custom_emotes: ['imageUrl'],
  mapScenes: ['imageUrl'],
  chatgroups: ['imageUrl'],
  bestiae: ['imageUrl'],
  worldMapEntries: ['imageUrl'],
  worldmemberships: ['avatarUrl', 'pjPersonaAvatarUrl'],
};

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

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async hardDelete(worldId: string): Promise<void> {
    // CD-03 (cascade-delete audit) — posbírat world image blob PŘED smazáním
    // dokumentu → úklid Cloudinary přes upload listener (ne-Cloudinary se ignoruje).
    if (Types.ObjectId.isValid(worldId)) {
      const world = await this.connection
        .collection('worlds')
        .findOne(
          { _id: new Types.ObjectId(worldId) },
          { projection: { imageUrl: 1, deletedAt: 1 } },
        );
      // RC-D7 (plný audit 2026-06-20) — restore-race: jediný caller je cron
      // (`findExpiredDeleted`). Pokud Admin svět obnovil v okně mezi výběrem
      // a touto kaskádou, `restore` nastavil `deletedAt=null` → NESMÍME smazat
      // živý svět (~35 kolekcí). Kaskádu provádíme jen na stále soft-smazaném.
      if (!world || !world.deletedAt) {
        return;
      }
      const imageUrl = world.imageUrl as string | undefined;
      if (imageUrl) {
        this.eventEmitter.emit('world.image.removed', { url: imageUrl });
      }
    }

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

    // 1.5) CD-RUN-7..12 — posbírat blob URL z blob-nesoucích kolekcí PŘED
    // jejich smazáním → úklid Cloudinary přes media.orphaned listener.
    for (const [coll, fields] of Object.entries(BLOB_COLLECTIONS)) {
      await this.collectBlobs(coll, { worldId }, fields);
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

  /**
   * CD-RUN-7..12 — posbírá hodnoty blob polí z dokumentů kolekce a emitne
   * `media.orphaned` (úklid Cloudinary). Ne-Cloudinary URL listener ignoruje.
   */
  private async collectBlobs(
    collection: string,
    filter: Record<string, unknown>,
    fields: string[],
  ): Promise<void> {
    try {
      const projection: Record<string, 1> = {};
      for (const f of fields) projection[f] = 1;
      const docs = (await this.connection
        .collection(collection)
        .find(filter, { projection })
        .toArray()) as Array<Record<string, unknown>>;
      const urls: string[] = [];
      for (const doc of docs) {
        for (const f of fields) {
          const v = doc[f];
          if (typeof v === 'string' && v.length > 0) urls.push(v);
        }
      }
      if (urls.length > 0) {
        this.eventEmitter.emit('media.orphaned', { urls });
      }
    } catch (err) {
      this.logger.error(
        `hardDelete: blob collect ${collection} selhal: ${(err as Error).message}`,
      );
    }
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
