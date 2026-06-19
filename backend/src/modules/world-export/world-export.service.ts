import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IWorldSettingsRepository } from '../worlds/interfaces/world-settings-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { ICharactersRepository } from '../characters/interfaces/characters-repository.interface';
import type { IWorldCalendarConfigRepository } from '../world-calendar-config/interfaces/world-calendar-config-repository.interface';
import type { IMapsRepository } from '../maps/interfaces/maps-repository.interface';
import type { IWorldMapsRepository } from '../world-maps/interfaces/world-maps-repository.interface';
import type { IWorldMapFoldersRepository } from '../world-maps/interfaces/world-map-folders-repository.interface';
import type { IUniverseRepository } from '../universe/interfaces/universe-repository.interface';
import type { ITimelineRepository } from '../timeline/interfaces/timeline-repository.interface';
import type { IGameEventRepository } from '../game-events/interfaces/game-event-repository.interface';
import type { ICampaignSubjectRepository } from '../campaign/interfaces/campaign-subject-repository.interface';
import type { ICampaignRelationshipRepository } from '../campaign/interfaces/campaign-relationship-repository.interface';
import type { ICampaignStorylineRepository } from '../campaign/interfaces/campaign-storyline-repository.interface';
import type { ICampaignScenarioRepository } from '../campaign/interfaces/campaign-scenario-repository.interface';
import type { ICampaignQuickNoteRepository } from '../campaign/interfaces/campaign-quick-note-repository.interface';
import type { ICampaignShopGroupRepository } from '../campaign/interfaces/campaign-shop-group-repository.interface';
import type { ICampaignShopItemRepository } from '../campaign/interfaces/campaign-shop-item-repository.interface';
import { CharacterDiaryRepository } from '../character-subdocs/repositories/character-diary.repository';
import { CharacterFinanceRepository } from '../character-subdocs/repositories/character-finance.repository';
import { CharacterInventoryRepository } from '../character-subdocs/repositories/character-inventory.repository';
import { CharacterNotesRepository } from '../character-subdocs/repositories/character-notes.repository';
import { CharacterCalendarRepository } from '../character-subdocs/repositories/character-calendar.repository';
import { CharacterAccountRepository } from '../character-subdocs/repositories/character-account.repository';
import { BestiaeRepository } from '../bestiae/repositories/bestiae.repository';
import {
  WORLD_EXPORT_VERSION,
  type WorldExportManifest,
} from './interfaces/world-export-payload.interface';

export interface ExportOptions {
  /** Zahrnout chat (kanály/zprávy). Default false — viz spec 14.7 B3. (Zatím no-op.) */
  chat?: boolean;
}

/** Vyfiltruje null z pole subdoců (postavy bez daného subdocu). */
function compact<T>(items: (T | null)[]): T[] {
  return items.filter((x): x is T => x != null);
}

/**
 * 14.7c — Serializace stromu JEDNOHO světa do ZIP (JSON; média jako URL).
 *
 * Scope:
 *  - `pj-full` (PJ / platform Admin) — čte celý strom přímo z repozitářů
 *    (PJ vidí vše → bez filtrů). Import-ready (stabilní ID + version + scope).
 *  - `viewer-partial` (hráč) — zatím 403 (leak-safe filtrace je follow-up).
 *
 * Mimo V1: stahování binárek médií do ZIP (URL zůstávají v datech, obrázky se
 * neztrácejí); per-PJ poznámky a chat. Viz plan-14.7c.
 */
@Injectable()
export class WorldExportService {
  constructor(
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldSettingsRepository')
    private readonly settingsRepo: IWorldSettingsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IPagesRepository')
    private readonly pagesRepo: IPagesRepository,
    @Inject('ICharactersRepository')
    private readonly charactersRepo: ICharactersRepository,
    @Inject('IWorldCalendarConfigRepository')
    private readonly calendarRepo: IWorldCalendarConfigRepository,
    @Inject('IMapsRepository')
    private readonly mapsRepo: IMapsRepository,
    @Inject('IWorldMapsRepository')
    private readonly worldMapsRepo: IWorldMapsRepository,
    @Inject('IWorldMapFoldersRepository')
    private readonly worldMapFoldersRepo: IWorldMapFoldersRepository,
    @Inject('IUniverseRepository')
    private readonly universeRepo: IUniverseRepository,
    @Inject('ITimelineRepository')
    private readonly timelineRepo: ITimelineRepository,
    @Inject('IGameEventRepository')
    private readonly gameEventsRepo: IGameEventRepository,
    @Inject('ICampaignSubjectRepository')
    private readonly campaignSubjectRepo: ICampaignSubjectRepository,
    @Inject('ICampaignRelationshipRepository')
    private readonly campaignRelationshipRepo: ICampaignRelationshipRepository,
    @Inject('ICampaignStorylineRepository')
    private readonly campaignStorylineRepo: ICampaignStorylineRepository,
    @Inject('ICampaignScenarioRepository')
    private readonly campaignScenarioRepo: ICampaignScenarioRepository,
    @Inject('ICampaignQuickNoteRepository')
    private readonly campaignQuickNoteRepo: ICampaignQuickNoteRepository,
    @Inject('ICampaignShopGroupRepository')
    private readonly shopGroupRepo: ICampaignShopGroupRepository,
    @Inject('ICampaignShopItemRepository')
    private readonly shopItemRepo: ICampaignShopItemRepository,
    @Inject('ICharacterDiaryRepository')
    private readonly diaryRepo: CharacterDiaryRepository,
    @Inject('ICharacterFinanceRepository')
    private readonly financeRepo: CharacterFinanceRepository,
    @Inject('ICharacterInventoryRepository')
    private readonly inventoryRepo: CharacterInventoryRepository,
    @Inject('ICharacterNotesRepository')
    private readonly notesRepo: CharacterNotesRepository,
    @Inject('ICharacterCalendarRepository')
    private readonly characterCalendarRepo: CharacterCalendarRepository,
    private readonly accountRepo: CharacterAccountRepository,
    private readonly bestiaeRepo: BestiaeRepository,
  ) {}

  /** Určí scope exportu, nebo vyhodí 403/404. */
  async resolveScope(
    worldId: string,
    requester: RequestUser,
  ): Promise<'pj-full' | 'viewer-partial'> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world) {
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen.',
      });
    }
    if (requester.role <= UserRole.Admin) return 'pj-full';

    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.Hrac) {
      throw new ForbiddenException({
        code: 'EXPORT_FORBIDDEN',
        message: 'Na export tohoto světa nemáš oprávnění.',
      });
    }
    return membership.role >= WorldRole.PJ ? 'pj-full' : 'viewer-partial';
  }

  /** Sestaví ZIP a streamuje ho do response (archiver pipe). */
  async streamExport(
    worldId: string,
    requester: RequestUser,
    opts: ExportOptions,
    res: Response,
  ): Promise<void> {
    const scope = await this.resolveScope(worldId, requester);
    if (scope !== 'pj-full') {
      throw new ForbiddenException({
        code: 'EXPORT_VIEWER_PARTIAL_NOT_READY',
        message:
          'Hráčský export se připravuje. Zatím může svět zálohovat jen PJ nebo administrátor.',
      });
    }

    const world = await this.worldsRepo.findById(worldId);
    if (!world) {
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen.',
      });
    }

    const tree = await this.collectTree(worldId, world.system, requester.id);

    const manifest: WorldExportManifest = {
      version: WORLD_EXPORT_VERSION,
      scope,
      exportedAt: new Date().toISOString(),
      worldId,
      worldSlug: world.slug,
      hasChat: false,
      counts: {
        pages: tree.pages.length,
        characters: tree.characters.length,
        members: tree.members.length,
        calendars: tree.calendars.length,
        mapScenes: tree.mapScenes.length,
        worldMaps: tree.worldMaps.length,
        timeline: tree.timeline.length,
        gameEvents: tree.gameEvents.length,
        bestiae: tree.bestiae.length,
        diaries: tree.characterSubdocs.diaries.length,
        campaignSubjects: tree.campaign.subjects.length,
        shopItems: tree.campaign.shopItems.length,
      },
    };

    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeSlug = world.slug.replace(/[^a-z0-9-]/gi, '_');

    const archive = new ZipArchive({ zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="svet-${safeSlug}-${dateStamp}.zip"`,
    );
    archive.pipe(res);

    archive.append(JSON.stringify(manifest, null, 2), {
      name: 'manifest.json',
    });
    archive.append(JSON.stringify(tree, null, 2), { name: 'data.json' });

    await archive.finalize();
  }

  /**
   * Sebere strom světa přes repozitáře (pj-full → čteme vše, bez filtrů).
   * Subdoc deník/finance/výbava/poznámky se čtou per-postava (nemají
   * `findByWorldId`); kalendář a účty hromadně.
   */
  private async collectTree(
    worldId: string,
    systemId: string,
    requesterId: string,
  ) {
    const characters = await this.charactersRepo.findByWorld(worldId);
    const charIds = characters.map((c) => c.id);

    const [
      settings,
      members,
      pages,
      calendars,
      mapScenes,
      worldMaps,
      worldMapFolders,
      universe,
      timelinePage,
      gameEvents,
      subdocCalendars,
      accounts,
      bestieAll,
      campaignSubjects,
      campaignRelationships,
      campaignStorylines,
      campaignScenarios,
      campaignQuickNotes,
      shopGroups,
      shopItems,
    ] = await Promise.all([
      this.settingsRepo.findByWorldId(worldId),
      this.membershipRepo.findByWorldId(worldId),
      this.pagesRepo.findByWorld(worldId),
      this.calendarRepo.findAllByWorldId(worldId),
      this.mapsRepo.findByWorld(worldId),
      this.worldMapsRepo.findByWorld(worldId),
      this.worldMapFoldersRepo.findByWorld(worldId),
      this.universeRepo.findByWorld(worldId),
      this.timelineRepo.findMany({ worldId, limit: 500 }),
      this.gameEventsRepo.findList({ worldId }),
      this.characterCalendarRepo.findByWorldId(worldId),
      this.accountRepo.findByWorldId(worldId),
      this.bestiaeRepo.findVisible({ systemId, userId: requesterId, worldId }),
      this.campaignSubjectRepo.findMany({ worldId }),
      this.campaignRelationshipRepo.findMany({ worldId }),
      this.campaignStorylineRepo.findMany({ worldId }),
      this.campaignScenarioRepo.findMany({ worldId }),
      this.campaignQuickNoteRepo.findMany({ worldId }),
      this.shopGroupRepo.findMany({ worldId }),
      this.shopItemRepo.findMany({ worldId }),
    ]);

    const [diaries, finances, inventories, notes] = await Promise.all([
      Promise.all(charIds.map((id) => this.diaryRepo.findByCharacterId(id))),
      Promise.all(charIds.map((id) => this.financeRepo.findByCharacterId(id))),
      Promise.all(
        charIds.map((id) => this.inventoryRepo.findByCharacterId(id)),
      ),
      Promise.all(charIds.map((id) => this.notesRepo.findByCharacterId(id))),
    ]);

    return {
      world: await this.worldsRepo.findById(worldId),
      settings,
      members,
      pages,
      characters,
      calendars,
      mapScenes,
      worldMaps,
      worldMapFolders,
      universe,
      timeline: timelinePage.events,
      gameEvents,
      // Bestie světa (system/user scope jsou globální → do zálohy světa nepatří).
      bestiae: bestieAll.filter((b) => b.scope === 'world'),
      characterSubdocs: {
        diaries: compact(diaries),
        finances: compact(finances),
        inventories: compact(inventories),
        notes: compact(notes),
        calendars: subdocCalendars,
        accounts,
      },
      campaign: {
        subjects: campaignSubjects,
        relationships: campaignRelationships,
        storylines: campaignStorylines,
        scenarios: campaignScenarios,
        quickNotes: campaignQuickNotes,
        shopGroups,
        shopItems,
      },
    };
  }
}
