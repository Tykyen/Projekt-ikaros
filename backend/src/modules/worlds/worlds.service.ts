import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { forwardRef } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { IWorldsRepository } from './interfaces/worlds-repository.interface';
import type { IWorldMembershipRepository } from './interfaces/world-membership-repository.interface';
import type { IWorldSettingsRepository } from './interfaces/world-settings-repository.interface';
import type { IWorldAccessRequestRepository } from './interfaces/world-access-request-repository.interface';
import { World } from './interfaces/world.interface';
import {
  WorldMembership,
  WorldRole,
} from './interfaces/world-membership.interface';
import type {
  WorldAccessRequest,
  MyWorldAccessRequest,
} from './interfaces/world-access-request.interface';
import { WorldSettings } from './interfaces/world-settings.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateWorldDto } from './dto/create-world.dto';
import { UpdateWorldDto } from './dto/update-world.dto';
import {
  UpdateWorldSettingsDto,
  CHARACTER_TAB_WHITELIST,
} from './dto/update-world-settings.dto';
import { UpdateAkjTypesDto } from './dto/update-akj-types.dto';
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';
import { SystemPresetsService } from '../system-presets/system-presets.service';
import { WorldWeatherService } from '../world-weather/world-weather.service';
import { UsersService } from '../users/users.service';
import { WorldCalendarConfigService } from '../world-calendar-config/world-calendar-config.service';
import type { IDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions-repository.interface';
import type {
  DiarySchemaVersion,
  DiarySchemaVersionMeta,
} from './diary-schema-versions/diary-schema-version.interface';

export interface RequestUser {
  id: string;
  role: UserRole;
  username: string;
}

/**
 * 2.3 D-NEW-quota — maximální počet aktivních světů, které smí mít jeden
 * vlastník (kromě globálních admin rolí). Soft-deleted světy se nepočítají.
 */
export const MAX_ACTIVE_WORLDS_PER_OWNER = 30;

/**
 * Krok 6.3 D-NEW-dice-default-set — výchozí sada kostek per RPG systém.
 *
 * Bez tohoto by nový svět měl `dice: []` a dice picker v chatu (6.3a) by
 * ukazoval prázdný stav. PJ může vždy přepsat v 5.3a editaci světa.
 *
 * Mapping vychází z reálných pravidel:
 * - Fate (matrix, fate): jen 4dF.
 * - D&D varianty: kompletní polyhedral sada + k%.
 * - DrD / Pi / Jad / Shadowrun / GURPS: jen kostky, které RPG aktivně používá.
 * - Ostatní / neznámé: konzervativní fallback `['fate', 'd6', 'd20']`.
 */
export const DEFAULT_DICE_BY_SYSTEM: Record<string, readonly string[]> = {
  matrix: ['fate'],
  fate: ['fate'],
  dnd2e: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'],
  dnd3plus: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'],
  dnd5e: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'],
  'drd-hero': ['d6', 'd10', 'd20'],
  'drd16-alchemy': ['d6', 'd10'],
  'drd16-ranger': ['d6', 'd10'],
  'drd16-thief': ['d6', 'd10'],
  'drd16-warrior': ['d6', 'd10'],
  'drd16-wizard': ['d6', 'd10'],
  gurps: ['d6'],
  shadowrun: ['d6'],
  pi: ['d6'],
  jad: ['d6', 'd10'],
  'call-of-cthulhu': ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'],
  'matrix-custom': ['fate', 'd6', 'd20'],
};

export const DEFAULT_DICE_FALLBACK: readonly string[] = ['fate', 'd6', 'd20'];

export function defaultDiceForSystem(system: string | undefined): string[] {
  if (!system) return [...DEFAULT_DICE_FALLBACK];
  const preset = DEFAULT_DICE_BY_SYSTEM[system];
  if (preset) return [...preset];
  return [...DEFAULT_DICE_FALLBACK];
}

/**
 * Krok 5.0 — sanitizace custom theme override. Propustí jen klíče s prefixem
 * `--theme-` a string hodnotu (max 200 zn.), max 60 položek. Chrání proti
 * vstříknutí libovolného CSS / cizích custom properties.
 */
export function sanitizeThemeOverrides(
  raw: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (count >= 60) break;
    if (!key.startsWith('--theme-')) continue;
    if (typeof value !== 'string' || value.length > 200) continue;
    out[key] = value;
    count++;
  }
  return out;
}

@Injectable()
export class WorldsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorldsService.name);

  constructor(
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldSettingsRepository')
    private readonly settingsRepo: IWorldSettingsRepository,
    @Inject('IWorldAccessRequestRepository')
    private readonly accessRequestRepo: IWorldAccessRequestRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly currenciesService: WorldCurrenciesService,
    @Inject('IDiarySchemaVersionsRepository')
    private readonly diaryVersionsRepo: IDiarySchemaVersionsRepository,
    private readonly systemPresetsService: SystemPresetsService,
    @Inject(forwardRef(() => WorldWeatherService))
    private readonly weatherService: WorldWeatherService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => WorldCalendarConfigService))
    private readonly calendarConfigService: WorldCalendarConfigService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async findAll(): Promise<World[]> {
    return this.worldsRepo.findAll();
  }

  async findById(id: string): Promise<World> {
    const world = await this.worldsRepo.findById(id);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    return this.enrichWithOwner(world);
  }

  async findBySlug(slug: string): Promise<World> {
    const world = await this.worldsRepo.findBySlug(slug);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    return this.enrichWithOwner(world);
  }

  /**
   * Spec 2.4 — scope-aware detail světa pro controller endpoint `GET /:id`.
   *
   * Pravidla viditelnosti:
   *  - public / open: kdokoliv logged-in (anon má `requester == null` → 404 pro private only).
   *  - private: jen member, autor pending access requestu, nebo Admin/Superadmin.
   *
   * Vrací **404** (ne 403) pro private bez přístupu — neprozradí existenci světa
   * (konzistentní s GitHub private repos pattern).
   */
  async findByIdForRequester(
    id: string,
    requester: RequestUser | null,
  ): Promise<World> {
    const world = await this.findById(id);
    return this.applyDetailScope(world, requester);
  }

  async findBySlugForRequester(
    slug: string,
    requester: RequestUser | null,
  ): Promise<World> {
    const world = await this.findBySlug(slug);
    return this.applyDetailScope(world, requester);
  }

  private async applyDetailScope(
    world: World,
    requester: RequestUser | null,
  ): Promise<World> {
    if (world.accessMode !== 'private') return world;
    // Private: 404 pokud anon, jinak vyžaduj member nebo pending AR nebo admin.
    if (!requester) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    }
    const isAdmin =
      requester.role === UserRole.Superadmin ||
      requester.role === UserRole.Admin;
    if (isAdmin) return world;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      world.id,
    );
    if (membership) return world;
    const ar = await this.accessRequestRepo.findByUserAndWorld(
      requester.id,
      world.id,
    );
    if (ar) return world;
    throw new NotFoundException({
      statusCode: 404,
      code: 'WORLD_NOT_FOUND',
      message: 'Svět nenalezen',
    });
  }

  /**
   * Spec 2.4 — populate `owner` (public summary) do detailu světa.
   * Pokud owner neexistuje (smazaný účet), pole zůstane undefined a FE/UI
   * zobrazí fallback („Vlastník neznámý").
   */
  private async enrichWithOwner(world: World): Promise<World> {
    try {
      const owner = await this.usersService.publicProfile(world.ownerId);
      return {
        ...world,
        owner: {
          id: owner.id,
          username: owner.username,
          avatarUrl: owner.avatarUrl,
        },
      };
    } catch {
      return world;
    }
  }

  async findMyWorlds(
    userId: string,
  ): Promise<{ world: World; membership: WorldMembership }[]> {
    const memberships = await this.membershipRepo.findByUserId(userId);
    if (memberships.length === 0) return [];
    const worldIds = memberships.map((m) => m.worldId);
    const worlds = await this.worldsRepo.findByIds(worldIds);
    const worldMap = new Map(worlds.map((w) => [w.id, w]));
    return memberships
      .map((m) => ({ world: worldMap.get(m.worldId), membership: m }))
      .filter(
        (r): r is { world: World; membership: WorldMembership } =>
          r.world != null,
      );
  }

  /**
   * 2.3 D-NEW-slug-check — public live availability check.
   * Vrací `true` pokud slug ještě nikdo nezabral.
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const normalized = slug.trim().toLowerCase();
    if (normalized.length < 2 || normalized.length > 40) return false;
    if (!/^[a-z0-9-]+$/.test(normalized)) return false;
    const taken = await this.worldsRepo.existsBySlug(normalized);
    return !taken;
  }

  async create(
    dto: CreateWorldDto,
    ownerId: string,
    ownerRole?: UserRole,
  ): Promise<World> {
    // 2.3 D-NEW-quota — Admin/Superadmin (role <= Admin) bez limitu;
    // ostatní max MAX_ACTIVE_WORLDS_PER_OWNER aktivních světů.
    if (ownerRole != null && ownerRole > UserRole.Admin) {
      const owned = await this.worldsRepo.findByOwnerId(ownerId);
      if (owned.length >= MAX_ACTIVE_WORLDS_PER_OWNER) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'WORLD_QUOTA_REACHED',
          message: `Dosáhl jsi limitu ${MAX_ACTIVE_WORLDS_PER_OWNER} aktivních světů.`,
        });
      }
    }

    const slugTaken = await this.worldsRepo.existsBySlug(dto.slug);
    if (slugTaken)
      throw new ConflictException({
        statusCode: 409,
        message: 'Slug již existuje',
        code: 'WORLD_SLUG_TAKEN',
      });

    const resolvedSystem = dto.system ?? 'matrix';
    // Krok 6.3 D-NEW-dice-default-set — pokud DTO nepošle dice (nebo prázdné),
    // doplníme smysluplnou sadu per RPG systém. PJ to v 5.3a smí přepsat.
    const resolvedDice =
      dto.dice && dto.dice.length > 0
        ? dto.dice
        : defaultDiceForSystem(resolvedSystem);

    // 9.3-F-I — Q1: calendar selector. Extract calendar fields z DTO před
    // worldsRepo.save (schema je ignoruje, ale držíme přehled).
    const {
      calendars: calendarsFromDto,
      defaultCalendarSlug: defaultCalendarSlugFromDto,
      ...worldDtoFields
    } = dto;
    // Resolve default slug: explicit volba PJ > první z calendars > 'gregorian'
    // (PJ vize: „základní by měl být Gregoriánský, případně ho změnit a dát, že neplatí").
    const resolvedDefaultSlug =
      defaultCalendarSlugFromDto ?? calendarsFromDto?.[0]?.slug ?? 'gregorian';

    const world = await this.worldsRepo.save({
      ...worldDtoFields,
      slug: dto.slug.toLowerCase(),
      ownerId,
      isActive: true,
      playerCount: dto.playerCount ?? 0,
      system: resolvedSystem,
      accessMode: dto.accessMode ?? 'private',
      dice: resolvedDice,
      defaultCalendarConfigSlug: resolvedDefaultSlug,
    });

    await this.membershipRepo.save({
      userId: ownerId,
      worldId: world.id,
      role: WorldRole.PJ,
      joinedAt: new Date(),
      akj: 0,
    });

    await this.currenciesService.seedForWorld(world.id, dto.genre);
    await this.weatherService.seedDefaultForWorld(
      world.id,
      dto.genre ?? 'other',
    );

    // 9.3-F-I — Q1: pokud PJ pošle vlastní `calendars`, seedne všechny.
    // Jinak BC fallback = auto-seed Gregorian default.
    if (calendarsFromDto !== undefined) {
      // PJ explicit volba (i prázdný array = svět bez kalendáře).
      for (const cal of calendarsFromDto) {
        await this.calendarConfigService.applyPresetTemplate(world.id, cal);
      }
    } else {
      // BC — žádné calendars v DTO, auto-seed Gregorian.
      await this.calendarConfigService.seedGregorianDefault(world.id);
    }

    // Auto-seed diarySchema z preset (Krok 7d)
    // 8.5-BE-2: navíc ulož i verzi 1 do diary_schema_versions
    // (předtím se seedovala jen `world_settings.diarySchema`, tabulka verzí
    // zůstávala prázdná → GET /diary-schema-versions vracel [] u nového světa).
    const preset = this.systemPresetsService.findOne(world.system);
    const seedSchema = preset?.schema ?? [];
    await this.settingsRepo.upsert(world.id, {
      diarySchema: seedSchema,
    });
    await this.diaryVersionsRepo.create({
      worldId: world.id,
      version: 1,
      system: world.system,
      schema: seedSchema,
      archivedAt: null,
    });

    this.eventEmitter.emit('world.created', world);
    return world;
  }

  /**
   * Krok 6.3 D-NEW-dice-default-set — backfill existujících světů s prázdným
   * `dice` polem. Nastavuje výchozí sadu kostek dle systému světa.
   * Idempotentní: world s neprázdným `dice` se nikdy nepřepíše.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const worlds = await this.worldsRepo.findAll();
      let updated = 0;
      for (const world of worlds) {
        if (!world.dice || world.dice.length === 0) {
          const defaults = defaultDiceForSystem(world.system);
          await this.worldsRepo.update(world.id, { dice: defaults });
          updated++;
        }
      }
      if (updated > 0) {
        this.logger.log(
          `Dice backfill: doplněn výchozí dice set u ${updated}/${worlds.length} světů`,
        );
      }
    } catch (err) {
      this.logger.error('Dice backfill při startu selhal', err);
    }

    // D-NEW-theme-bg-empty (2026-05-23) — vyčistí legacy `themeBackgroundUrl: ''`
    // z dokumentů zapsaných před FE/BE fixem. Idempotentní; po prvním
    // úspěšném běhu v ostrém prostředí je no-op.
    try {
      const { updated: bgCleared } =
        await this.worldsRepo.migrateEmptyThemeBackgroundUrls();
      if (bgCleared > 0) {
        this.logger.log(
          `theme-bg-empty: vyčištěno ${bgCleared} světů s prázdným themeBackgroundUrl`,
        );
      }
    } catch (err) {
      this.logger.error('theme-bg-empty migrace selhala', err);
    }
  }

  async update(
    id: string,
    dto: UpdateWorldDto,
    requester: RequestUser,
  ): Promise<World> {
    const world = await this.findById(id);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      id,
    );
    if (!this.canEditWorldData(requester, world, membership ?? undefined)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }

    // Krok 7d: archive + re-seed při změně system
    // 8.5-BE-2 oprava: nyní zachovává integritu tabulky verzí —
    //   1. archivuje stávající aktivní verzi (set archivedAt)
    //   2. vytvoří novou aktivní verzi pro nový system (archivedAt: null)
    //   3. updatuje live `world_settings.diarySchema` na nové preset schéma
    if (dto.system && dto.system !== world.system) {
      const active = await this.diaryVersionsRepo.findActive(id);
      if (active) {
        await this.diaryVersionsRepo.archive(id, active.version);
      }
      const preset = this.systemPresetsService.findOne(dto.system);
      const nextSchema = preset?.schema ?? [];
      const lastVersion = await this.diaryVersionsRepo.findLastVersion(id);
      await this.diaryVersionsRepo.create({
        worldId: id,
        version: lastVersion + 1,
        system: dto.system,
        schema: nextSchema,
        archivedAt: null,
      });
      await this.settingsRepo.upsert(id, {
        diarySchema: nextSchema,
      });
    }

    // Krok 5.0 — sanitizace custom theme override: jen `--theme-*` klíče,
    // hodnota string, max 60 položek. Nevalidní klíče se zahodí.
    // D-NEW-theme-bg-empty (2026-05-21) — `themeBackgroundUrl: null` z FE = explicit clear.
    // Vytáhneme z payload a zavoláme `clearThemeBackgroundUrl` separátně ($unset).
    // Empty string '' (legacy z dřívějšího FE workaroundu) také clear.
    const clearBackground =
      dto.themeBackgroundUrl === null || dto.themeBackgroundUrl === '';
    const { themeBackgroundUrl: _bgIgnored, ...dtoWithoutBg } = dto;
    const baseDto: UpdateWorldDto = clearBackground ? dtoWithoutBg : dto;

    const payload: UpdateWorldDto = baseDto.themeOverrides
      ? {
          ...baseDto,
          themeOverrides: sanitizeThemeOverrides(baseDto.themeOverrides),
        }
      : baseDto;

    let updated = await this.worldsRepo.update(id, payload as Partial<World>);
    if (clearBackground) {
      await this.worldsRepo.clearThemeBackgroundUrl(id);
      // Refetch po $unset, jinak `updated` ještě nese starou themeBackgroundUrl.
      updated = await this.worldsRepo.findById(id);
    }
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });

    this.eventEmitter.emit('world.updated', updated);
    return updated;
  }

  /**
   * D-NEW-slug-rename — atomický rename slugu světa s redirect historií.
   * Validace: nový slug `^[a-z0-9][a-z0-9-]*$` (URL-safe), 2–48 znaků,
   * unique mezi `worlds` (i mezi `previousSlugs` jiných světů). Starý slug
   * se uloží do `previousSlugs` → URL `/svet/<old>` redirectne přes
   * `findByCurrentOrPreviousSlug`.
   */
  async renameSlug(
    worldId: string,
    newSlug: string,
    requester: RequestUser,
  ): Promise<World> {
    const world = await this.findById(worldId);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!this.canEditWorldData(requester, world, membership ?? undefined)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const lower = newSlug.toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(lower)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_SLUG',
        message:
          'Slug musí začínat písmenem nebo číslicí; povolené znaky a-z, 0-9, -; délka 2–48.',
      });
    }
    if (world.slug === lower) return world;
    const updated = await this.worldsRepo.renameSlug(worldId, lower);
    if (!updated) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SLUG_TAKEN',
        message: 'Tento slug už používá jiný svět.',
      });
    }
    this.eventEmitter.emit('world.updated', updated);
    this.eventEmitter.emit('world.slug.renamed', {
      worldId,
      oldSlug: world.slug,
      newSlug: lower,
    });
    return updated;
  }

  /**
   * Spec 2.4 — vstup do **public** světa. Vytvoří membership s rolí Čtenář.
   * Hráčem se stává explicitně později (vytvoření postavy, fáze 5+).
   *
   * Pro open/private světy volat `requestAccess` (pre-membership flow).
   */
  async joinPublic(worldId: string, userId: string): Promise<WorldMembership> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (world.accessMode === 'closed')
      throw new ForbiddenException({
        statusCode: 403,
        code: 'WORLD_CLOSED',
        message: 'Svět je uzavřen',
      });
    if (world.accessMode !== 'public')
      throw new BadRequestException({
        statusCode: 400,
        code: 'WORLD_NOT_PUBLIC',
        message:
          'Tento svět vyžaduje souhlas PJ. Použij endpoint /access-request.',
      });

    const existing = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (existing)
      throw new ConflictException({
        statusCode: 409,
        message: 'Již jsi členem tohoto světa',
        code: 'WORLD_ALREADY_MEMBER',
      });

    const pendingAr = await this.accessRequestRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (pendingAr)
      throw new ConflictException({
        statusCode: 409,
        message: 'Máš pending žádost o vstup do tohoto světa',
        code: 'PENDING_ACCESS_REQUEST',
      });

    const membership = await this.membershipRepo.save({
      userId,
      worldId,
      role: WorldRole.Ctenar,
      joinedAt: new Date(),
      akj: 0,
    });

    this.eventEmitter.emit('world.membership.changed', { worldId, membership });
    return membership;
  }

  /**
   * Spec 2.4 — žádost o vstup do **open / private** světa. Vytvoří
   * `WorldAccessRequest` (pre-membership, mimo `world_memberships`). PJ
   * schvaluje ve Zpracovat tabu (`world_access_request` provider).
   */
  async requestAccess(
    worldId: string,
    userId: string,
  ): Promise<WorldAccessRequest> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (world.accessMode === 'closed')
      throw new ForbiddenException({
        statusCode: 403,
        code: 'WORLD_CLOSED',
        message: 'Svět je uzavřen',
      });
    if (world.accessMode === 'public')
      throw new BadRequestException({
        statusCode: 400,
        code: 'WORLD_IS_PUBLIC',
        message: 'Public svět nevyžaduje žádost. Použij endpoint /join.',
      });

    const member = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (member)
      throw new ConflictException({
        statusCode: 409,
        message: 'Již jsi členem tohoto světa',
        code: 'WORLD_ALREADY_MEMBER',
      });

    // create() vyhodí ConflictException pri duplicate (unique index).
    const ar = await this.accessRequestRepo.create({ worldId, userId });

    this.eventEmitter.emit('world.access.requested', {
      accessRequestId: ar.id,
      worldId,
      worldName: world.name,
      worldSlug: world.slug,
      ownerId: world.ownerId,
      requesterId: userId,
    });
    return ar;
  }

  /**
   * Spec 2.4 — žadatel zruší vlastní pending žádost o vstup.
   * Idempotentní: pokud AR neexistuje, 404.
   */
  async cancelAccessRequest(
    worldId: string,
    userId: string,
  ): Promise<{ ok: true }> {
    const ar = await this.accessRequestRepo.findByUserAndWorld(userId, worldId);
    if (!ar)
      throw new NotFoundException({
        statusCode: 404,
        code: 'ACCESS_REQUEST_NOT_FOUND',
        message: 'Žádost o vstup nenalezena',
      });

    await this.accessRequestRepo.delete(ar.id);

    const world = await this.worldsRepo.findById(worldId);
    if (world) {
      this.eventEmitter.emit('world.access.cancelled', {
        accessRequestId: ar.id,
        worldId,
        ownerId: world.ownerId,
      });
    }
    return { ok: true };
  }

  /**
   * Spec 2.4 — PJ vlastník (nebo Admin/Superadmin) schválí žádost o vstup.
   * Smaže AR + vytvoří membership s rolí Čtenář.
   *
   * Atomicita (D-061, 2026-05-24): pokud Mongo běží jako replica set, použij
   * `session.withTransaction()` — create membership + delete AR atomicky.
   * Pokud replica set chybí (dev mongo bez `?replicaSet=rs0`), gracefully
   * fallback na pragmatický sekvenční flow s idempotentním cleanup: create
   * (unique index proti race), pak best-effort delete AR; orphan AR se uklidí
   * dalším pokusem o approve/cancel.
   */
  async approveAccessRequest(
    worldId: string,
    accessRequestId: string,
    requester: RequestUser,
  ): Promise<{ ok: true; membership: WorldMembership }> {
    const world = await this.findById(worldId);
    this.assertCanModerateAccessRequests(world, requester);

    const ar = await this.accessRequestRepo.findById(accessRequestId);
    if (!ar || ar.worldId !== worldId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'ACCESS_REQUEST_NOT_FOUND',
        message: 'Žádost o vstup nenalezena',
      });

    // D-061 — pokus o atomic Mongo transaction; fallback na sekvenční flow.
    const session = await this.connection.startSession();
    let membership: WorldMembership | null = null;
    try {
      try {
        await session.withTransaction(async () => {
          membership = await this.membershipRepo.save(
            {
              userId: ar.userId,
              worldId,
              role: WorldRole.Ctenar,
              joinedAt: new Date(),
              akj: 0,
            },
            session,
          );
          await this.accessRequestRepo.delete(ar.id, session);
        });
      } catch (txErr) {
        const msg = (txErr as Error).message || '';
        if (
          msg.includes('replica set') ||
          msg.includes('Transaction numbers') ||
          msg.includes('IllegalOperation')
        ) {
          this.logger.warn(
            'Mongo replica set not available, falling back to sequential approveAccessRequest (D-061).',
          );
          membership = await this.approveAccessRequestSequentialFallback(
            ar.userId,
            worldId,
            ar.id,
          );
        } else if (
          typeof txErr === 'object' &&
          txErr !== null &&
          (txErr as { code?: number }).code === 11000
        ) {
          // Race v rámci transakce: membership už existuje (unique). Použij existující + smaž AR.
          const existing = await this.membershipRepo.findByUserAndWorld(
            ar.userId,
            worldId,
          );
          if (!existing) throw txErr;
          membership = existing;
          await this.accessRequestRepo.delete(ar.id);
        } else {
          throw txErr;
        }
      }
    } finally {
      await session.endSession();
    }

    if (!membership)
      throw new NotFoundException({
        statusCode: 500,
        code: 'APPROVE_FAILED',
        message: 'Schválení žádosti se nezdařilo',
      });

    this.eventEmitter.emit('world.access.approved', {
      accessRequestId: ar.id,
      worldId,
      worldName: world.name,
      worldSlug: world.slug,
      requesterId: ar.userId,
    });
    this.eventEmitter.emit('world.membership.changed', {
      worldId,
      membership,
    });
    return { ok: true, membership };
  }

  /**
   * D-061 — sekvenční fallback path pro Mongo bez replica setu.
   * 1) create membership (unique index proti race) → existující membership při kolizi.
   * 2) best-effort delete AR.
   */
  private async approveAccessRequestSequentialFallback(
    userId: string,
    worldId: string,
    accessRequestId: string,
  ): Promise<WorldMembership> {
    let membership: WorldMembership;
    try {
      membership = await this.membershipRepo.save({
        userId,
        worldId,
        role: WorldRole.Ctenar,
        joinedAt: new Date(),
        akj: 0,
      });
    } catch (e: unknown) {
      const existing = await this.membershipRepo.findByUserAndWorld(
        userId,
        worldId,
      );
      if (!existing) throw e;
      membership = existing;
    }
    await this.accessRequestRepo.delete(accessRequestId);
    return membership;
  }

  /**
   * Spec 2.4 — PJ vlastník (nebo Admin/Superadmin) zamítne žádost o vstup.
   * Smaže AR; žadatel může požádat znovu (vznikne nová AR).
   */
  async rejectAccessRequest(
    worldId: string,
    accessRequestId: string,
    requester: RequestUser,
  ): Promise<{ ok: true }> {
    const world = await this.findById(worldId);
    this.assertCanModerateAccessRequests(world, requester);

    const ar = await this.accessRequestRepo.findById(accessRequestId);
    if (!ar || ar.worldId !== worldId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'ACCESS_REQUEST_NOT_FOUND',
        message: 'Žádost o vstup nenalezena',
      });

    const ok = await this.accessRequestRepo.delete(ar.id);
    if (!ok)
      throw new NotFoundException({
        statusCode: 404,
        code: 'ACCESS_REQUEST_NOT_FOUND',
        message: 'Žádost o vstup nenalezena',
      });

    this.eventEmitter.emit('world.access.rejected', {
      accessRequestId: ar.id,
      worldId,
      worldName: world.name,
      requesterId: ar.userId,
    });
    return { ok: true };
  }

  /**
   * Spec 2.4 — vlastní pending access requesty current logged-in usera.
   * Vrací embedded summary světa pro FE labely.
   */
  async findMyAccessRequests(userId: string): Promise<MyWorldAccessRequest[]> {
    const ars = await this.accessRequestRepo.findByUserId(userId);
    if (ars.length === 0) return [];
    const worldIds = Array.from(new Set(ars.map((r) => r.worldId)));
    const worlds = await this.worldsRepo.findByIds(worldIds);
    const worldMap = new Map(worlds.map((w) => [w.id, w]));
    return ars
      .map((r) => {
        const world = worldMap.get(r.worldId);
        if (!world) return null;
        return {
          accessRequest: r,
          world: {
            id: world.id,
            name: world.name,
            slug: world.slug,
            accessMode: world.accessMode,
          },
        };
      })
      .filter((x): x is MyWorldAccessRequest => x !== null);
  }

  private assertCanModerateAccessRequests(
    world: World,
    requester: RequestUser,
  ): void {
    const isOwner = world.ownerId === requester.id;
    const isAdmin =
      requester.role === UserRole.Superadmin ||
      requester.role === UserRole.Admin;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
  }

  async getMembers(
    worldId: string,
    requester: RequestUser | null,
    filters?: { role?: number; group?: string },
  ): Promise<WorldMembership[]> {
    // N-7 — dřív bez access checku: anon četl členy privátního světa.
    // findByIdForRequester hodí 404 u private světa bez membershipu (public/open
    // projde i anonymovi), konzistentně s ostatními read endpointy (D-016/D-063).
    await this.findByIdForRequester(worldId, requester);
    const members = await this.membershipRepo.findByWorldId(worldId, filters);
    return this.enrichMembers(members);
  }

  /**
   * Krok 5.3 — ke každému membershipu připojí public summary uživatele
   * (username, avatar účtu). Smazaný účet → `user` zůstane undefined a UI
   * zobrazí fallback. Analogie `enrichWithOwner`.
   */
  private async enrichMembers(
    members: WorldMembership[],
  ): Promise<WorldMembership[]> {
    return Promise.all(
      members.map(async (m) => {
        try {
          const profile = await this.usersService.publicProfile(m.userId);
          return {
            ...m,
            user: {
              id: profile.id,
              username: profile.username,
              avatarUrl: profile.avatarUrl,
              lastSeenAt: profile.lastSeenAt,
            },
          };
        } catch {
          return m;
        }
      }),
    );
  }

  async getSettings(worldId: string): Promise<WorldSettings | null> {
    return this.settingsRepo.findByWorldId(worldId);
  }

  async updateSettings(
    worldId: string,
    dto: UpdateWorldSettingsDto,
    requester: RequestUser,
  ): Promise<WorldSettings> {
    const world = await this.findById(worldId);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!this.canAdminWorld(requester, world, membership ?? undefined)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const sanitized = this.sanitizeUpdateSettingsDto(dto);
    const settings = await this.settingsRepo.upsert(
      worldId,
      sanitized as Partial<WorldSettings>,
    );
    this.eventEmitter.emit('world.settings.updated', { worldId, settings });
    return settings;
  }

  /**
   * Side-task character-tab-visibility — defense-in-depth: deduplikace a
   * filtrace přes whitelist (i kdyby DTO validace propustila nečekanou hodnotu).
   */
  private sanitizeUpdateSettingsDto(
    dto: UpdateWorldSettingsDto,
  ): UpdateWorldSettingsDto {
    let out = dto;
    // 12.2 — server je autorita nad `lastInfo.updatedAt` (klientský dismiss se
    // na něj váže). `null` = smazat oznámení.
    if (dto.lastInfo !== undefined) {
      out = {
        ...out,
        lastInfo:
          dto.lastInfo === null
            ? null
            : ({
                text: dto.lastInfo.text,
                visible: dto.lastInfo.visible,
                updatedAt: new Date(),
              } as unknown as UpdateWorldSettingsDto['lastInfo']),
      };
    }
    if (!out.characterTabVisibility) return out;
    const whitelist = CHARACTER_TAB_WHITELIST as readonly string[];
    const clean = (list?: string[]): string[] | undefined => {
      if (!list) return undefined;
      const seen = new Set<string>();
      const acc: string[] = [];
      for (const item of list) {
        if (!whitelist.includes(item)) continue;
        if (seen.has(item)) continue;
        seen.add(item);
        acc.push(item);
        if (acc.length >= 6) break;
      }
      return acc;
    };
    return {
      ...out,
      characterTabVisibility: {
        PostavaHrace: clean(out.characterTabVisibility.PostavaHrace),
        NPC: clean(out.characterTabVisibility.NPC),
      },
    };
  }

  /**
   * Krok 5.3d — uloží AKJ úrovně světa. Dedikovaný endpoint s guardem
   * `canManageMembers` (PomocnyPJ+), aby AKJ definici zvládl i PomocnyPJ
   * bez přístupu ke zbytku WorldSettings (`updateSettings` je PJ-only).
   */
  async updateAkjTypes(
    worldId: string,
    dto: UpdateAkjTypesDto,
    requester: RequestUser,
  ): Promise<WorldSettings> {
    const world = await this.findById(worldId);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!this.canManageMembers(requester, world, membership ?? undefined)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const settings = await this.settingsRepo.upsert(worldId, {
      akjTypes: dto.akjTypes,
    });
    this.eventEmitter.emit('world.settings.updated', { worldId, settings });
    return settings;
  }

  /**
   * 9.2b — Update defaultního kalendáře + společný timelineEpoch.
   * Validuje, že `defaultCalendarConfigSlug` ukazuje na existující config
   * v `world_calendar_configs` daného světa.
   */
  async updateCalendarDefaults(
    worldId: string,
    dto: {
      defaultCalendarConfigSlug?: string;
      timelineEpoch?: number;
    },
    requester: RequestUser,
  ): Promise<World> {
    await this.findById(worldId); // throws 404
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    const allowed =
      requester.role <= UserRole.Admin ||
      (membership != null && membership.role >= WorldRole.PomocnyPJ);
    if (!allowed)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    if (dto.defaultCalendarConfigSlug !== undefined) {
      const config = await this.calendarConfigService.getConfigInternal(
        worldId,
        dto.defaultCalendarConfigSlug,
      );
      if (!config)
        throw new NotFoundException({
          statusCode: 404,
          code: 'CALENDAR_CONFIG_NOT_FOUND',
          message: `Kalendář '${dto.defaultCalendarConfigSlug}' ve světě neexistuje`,
        });
    }

    const patch: Partial<World> = {};
    if (dto.defaultCalendarConfigSlug !== undefined) {
      patch.defaultCalendarConfigSlug = dto.defaultCalendarConfigSlug;
    }
    if (dto.timelineEpoch !== undefined) {
      patch.timelineEpoch = dto.timelineEpoch;
    }
    const updated = await this.worldsRepo.update(worldId, patch);
    if (!updated) {
      // Race condition — world byl smazán mezi findById a update.
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    }
    this.eventEmitter.emit('world.calendar-defaults.updated', {
      worldId,
      defaults: patch,
    });
    return updated;
  }

  /**
   * D-062 — Charakter request flow. Člen s rolí Čtenář (čte, ale nehraje)
   * požádá o postavu → role se sníží na Žadatel (vzniká PJ pending action).
   * PJ pak ručně vytvoří postavu a přiřadí ji (fáze 8.2 už hotová).
   *
   * Idempotent: pokud member už je Žadatel, vrací current membership beze změny.
   * Vyšší role (Hrac+) ignorují — ti mají vlastní postavy.
   */
  async requestCharacter(
    worldId: string,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    await this.findById(worldId);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Nejsi členem tohoto světa.',
      });
    }
    if (membership.role >= WorldRole.Hrac) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'ALREADY_HAS_CHARACTER_ROLE',
        message: 'Tvoje role už znamená přístup k postavě.',
      });
    }
    if (membership.role === WorldRole.Zadatel) {
      return membership; // idempotent
    }
    const updated = await this.membershipRepo.update(membership.id, {
      role: WorldRole.Zadatel,
    });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    this.eventEmitter.emit('world.character.requested', {
      worldId,
      userId: requester.id,
      membershipId: updated.id,
    });
    return updated;
  }

  /**
   * N-18 — ověří, že membership patří světu z URL. Controllery membership
   * endpointů to volají jako pre-check; dřív se `:worldId` v cestě nevynucoval
   * (service si worldId brala z membershipu), takže URL izolace byla jen
   * dekorativní (validní membershipId jiného světa prošel).
   */
  async assertMembershipInWorld(
    membershipId: string,
    worldId: string,
  ): Promise<void> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership || membership.worldId !== worldId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Členství nenalezeno',
      });
  }

  async updateMemberRole(
    membershipId: string,
    role: WorldRole,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      membership.worldId,
    );
    if (
      !this.canManageMembers(requester, world, requesterMembership ?? undefined)
    )
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.membershipRepo.update(membershipId, { role });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    this.eventEmitter.emit('world.membership.changed', {
      worldId: membership.worldId,
      membership: updated,
    });
    return updated;
  }

  async updateMemberGroup(
    membershipId: string,
    group: string | undefined,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      membership.worldId,
    );
    if (
      !this.canManageMembers(requester, world, requesterMembership ?? undefined)
    )
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.membershipRepo.update(membershipId, { group });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    return updated;
  }

  async updateMemberCharacter(
    membershipId: string,
    characterPath: string | null | undefined,
    requester: RequestUser,
    avatarUrl?: string | null,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    if (membership.userId !== requester.id) {
      const requesterMembership = await this.membershipRepo.findByUserAndWorld(
        requester.id,
        membership.worldId,
      );
      if (
        !this.canManageMembers(
          requester,
          world,
          requesterMembership ?? undefined,
        )
      ) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Nedostatečná oprávnění',
        });
      }
    }

    // Prázdné (null/undefined) → odpojení přes $unset; jinak přiřazení
    // (vč. world-scoped avataru = obrázek postavy).
    const updated = characterPath
      ? await this.membershipRepo.update(membershipId, {
          characterPath,
          avatarUrl: avatarUrl ?? undefined,
        })
      : await this.membershipRepo.clearCharacter(membershipId);
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    // 13.2b — když PJ přiřadí postavu JINÉMU členovi (ne sám sobě) a postava se
    // reálně změnila, pošli mu systémovou zprávu („Přiřazena postava").
    if (
      characterPath &&
      membership.userId !== requester.id &&
      membership.characterPath !== characterPath
    ) {
      this.eventEmitter.emit('world.character.assigned', {
        worldId: membership.worldId,
        worldName: world.name,
        userId: membership.userId,
        characterPath,
      });
    }
    return updated;
  }

  async updateMemberAkj(
    membershipId: string,
    akj: number,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      membership.worldId,
    );
    if (
      !this.canManageMembers(requester, world, requesterMembership ?? undefined)
    )
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.membershipRepo.update(membershipId, { akj });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    return updated;
  }

  /**
   * Krok 5.9 — uložení vlastního doladění vzhledu světa. Člen edituje jen
   * své vlastní membership (přístupnost — jas / kontrast / barvy).
   */
  async updateMyTheme(
    worldId: string,
    dto: {
      themeAdjust?: Record<string, number>;
      themeUserOverrides?: Record<string, string>;
    },
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NOT_A_MEMBER',
        message: 'Nejsi členem světa',
      });

    const updated = await this.membershipRepo.update(membership.id, {
      themeAdjust: dto.themeAdjust,
      themeUserOverrides: dto.themeUserOverrides,
    });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    return updated;
  }

  async updateMemberFree(
    membershipId: string,
    isFree: boolean,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      membership.worldId,
    );
    if (
      !this.canManageMembers(requester, world, requesterMembership ?? undefined)
    )
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.membershipRepo.update(membershipId, { isFree });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    return updated;
  }

  async softDelete(
    id: string,
    requester: RequestUser,
  ): Promise<{ message: string }> {
    const world = await this.findById(id);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      id,
    );
    if (!this.canAdminWorld(requester, world, requesterMembership ?? undefined))
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    await this.worldsRepo.update(id, { isActive: false });
    this.eventEmitter.emit('world.deleted', { worldId: id });
    return { message: 'Svět byl smazán' };
  }

  async leave(
    membershipId: string,
    requester: RequestUser,
  ): Promise<{ message: string }> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);

    if (membership.userId !== requester.id) {
      const requesterMembership = await this.membershipRepo.findByUserAndWorld(
        requester.id,
        membership.worldId,
      );
      if (
        !this.canManageMembers(
          requester,
          world,
          requesterMembership ?? undefined,
        )
      )
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Nedostatečná oprávnění',
        });
    }

    if (membership.userId === requester.id && world.ownerId === requester.id) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Vlastník nemůže opustit svůj svět',
      });
    }

    await this.membershipRepo.delete(membershipId);

    if (membership.role === WorldRole.Hrac) {
      await this.worldsRepo.increment(membership.worldId, 'playerCount', -1);
    }

    this.eventEmitter.emit('world.membership.removed', {
      worldId: membership.worldId,
      membershipId,
      userId: membership.userId,
    });
    return { message: 'Opustil jsi svět' };
  }

  async getDiarySchemaVersions(
    worldId: string,
    requester: RequestUser,
  ): Promise<DiarySchemaVersionMeta[]> {
    await this.assertMember(worldId, requester);
    return this.diaryVersionsRepo.findMetaByWorldId(worldId);
  }

  async getDiarySchemaVersion(
    worldId: string,
    version: number,
    requester: RequestUser,
  ): Promise<DiarySchemaVersion> {
    await this.assertMember(worldId, requester);
    const v = await this.diaryVersionsRepo.findByWorldIdAndVersion(
      worldId,
      version,
    );
    if (!v)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Verze nenalezena',
      });
    return v;
  }

  /**
   * 8.5-BE-1 — vytvoří novou verzi diary schématu pro svět (PJ+).
   * Archivuje stávající aktivní verzi (set `archivedAt = now`), inkrementuje
   * `version` o 1 a uloží novou aktivní verzi (`archivedAt: null`). Aktualizuje
   * i live `world_settings.diarySchema` (= aktivní snapshot).
   */
  async createDiarySchemaVersion(
    worldId: string,
    dto: {
      schema: Array<{
        key: string;
        label: string;
        type: string;
        order: number;
        config?: Record<string, unknown>;
        id?: string;
        layoutArea?: string;
      }>;
    },
    requester: RequestUser,
  ): Promise<DiarySchemaVersion> {
    const world = await this.findById(worldId);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!this.canAdminWorld(requester, world, membership ?? undefined)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Pouze PJ+ smí měnit šablonu deníku světa',
      });
    }

    const active = await this.diaryVersionsRepo.findActive(worldId);
    if (active) {
      await this.diaryVersionsRepo.archive(worldId, active.version);
    }

    const lastVersion = await this.diaryVersionsRepo.findLastVersion(worldId);
    const created = await this.diaryVersionsRepo.create({
      worldId,
      version: lastVersion + 1,
      system: world.system,
      schema: dto.schema,
      archivedAt: null,
    });

    await this.settingsRepo.upsert(worldId, {
      diarySchema: dto.schema,
    });

    return created;
  }

  /**
   * 8.5 — vrátí aktivní verzi diary schématu světa (nebo `null` pokud žádná).
   * Veřejný helper pro `character-subdocs` (fallback při čtení deníku postavy
   * bez `personalDiarySchema`).
   */
  async getActiveDiarySchemaVersion(
    worldId: string,
  ): Promise<DiarySchemaVersion | null> {
    return this.diaryVersionsRepo.findActive(worldId);
  }

  /**
   * 8.5 — veřejný PJ+ assert. Pro use case z jiných modulů (např. character-subdocs
   * bulk reset overridů), které nepotřebují celý privátní `canAdminWorld` aparát.
   */
  async assertCanAdminWorld(
    worldId: string,
    requester: RequestUser,
  ): Promise<World> {
    const world = await this.findById(worldId);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!this.canAdminWorld(requester, world, membership ?? undefined)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Pouze PJ+ smí provést tuto akci',
      });
    }
    return world;
  }

  /**
   * D-NEW-world-transfer — předání vlastnictví světa jinému členovi.
   * Smí jen současný vlastník nebo globální Admin/Superadmin. Nový vlastník
   * musí být členem světa; povýší se na PJ, původní vlastník se demotuje
   * na Pomocného PJ (aby mohl svět případně opustit).
   */
  async transferOwnership(
    worldId: string,
    newOwnerId: string,
    requester: RequestUser,
  ): Promise<World> {
    const world = await this.findById(worldId);

    const isOwner = world.ownerId === requester.id;
    const isAdmin = requester.role <= UserRole.Admin;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Svět smí předat jen jeho vlastník nebo administrátor',
      });
    }

    if (newOwnerId === world.ownerId) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'WORLD_TRANSFER_SAME_OWNER',
        message: 'Nový vlastník je shodný se současným',
      });
    }

    const newOwnerMembership = await this.membershipRepo.findByUserAndWorld(
      newOwnerId,
      worldId,
    );
    if (!newOwnerMembership) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'WORLD_TRANSFER_NOT_MEMBER',
        message: 'Nový vlastník musí být členem světa',
      });
    }

    // Nový vlastník → role PJ.
    if (newOwnerMembership.role !== WorldRole.PJ) {
      await this.membershipRepo.update(newOwnerMembership.id, {
        role: WorldRole.PJ,
      });
    }

    // Původní vlastník → demote na PomocnyPJ (umožní mu svět opustit).
    const oldOwnerMembership = await this.membershipRepo.findByUserAndWorld(
      world.ownerId,
      worldId,
    );
    if (oldOwnerMembership && oldOwnerMembership.role === WorldRole.PJ) {
      await this.membershipRepo.update(oldOwnerMembership.id, {
        role: WorldRole.PomocnyPJ,
      });
    }

    const updated = await this.worldsRepo.update(worldId, {
      ownerId: newOwnerId,
    });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });

    this.eventEmitter.emit('world.updated', updated);
    // N-15 — membership.changed se z transferu odebral: emitoval `{ worldId }`
    // bez `membership`, takže gateway pushoval `undefined`. Transfer navíc mění
    // víc memberships (starý+nový owner), což push jednoho objektu stejně
    // nepokryje. `world.updated` výš spustí refetch na klientech.
    return updated;
  }

  private async assertMember(
    worldId: string,
    requester: RequestUser,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nejsi členem tohoto světa',
      });
    if (membership.role < WorldRole.Hrac) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Pending členství nemá přístup',
      });
    }
  }

  private canAdminWorld(
    requester: RequestUser,
    _world: World,
    membership?: WorldMembership,
  ): boolean {
    if (requester.role <= UserRole.Admin) return true;
    if (membership && membership.role >= WorldRole.PJ) return true;
    return false;
  }

  private canManageMembers(
    requester: RequestUser,
    world: World,
    membership?: WorldMembership,
  ): boolean {
    if (this.canAdminWorld(requester, world, membership)) return true;
    if (membership && membership.role >= WorldRole.PomocnyPJ) return true;
    return false;
  }

  private canEditWorldData(
    requester: RequestUser,
    world: World,
    membership?: WorldMembership,
  ): boolean {
    if (this.canManageMembers(requester, world, membership)) return true;
    if (membership && membership.role >= WorldRole.Korektor) return true;
    return false;
  }

  // ─── Character event listeners (membership sync) ─────────────────────────

  @OnEvent('character.created')
  async onCharacterCreated(payload: {
    userId?: string;
    worldId: string;
    isNpc: boolean;
    name: string;
    slug: string;
    imageUrl?: string;
  }): Promise<void> {
    if (payload.isNpc || !payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      payload.userId,
      payload.worldId,
    );
    if (!membership) return;
    await this.membershipRepo.update(membership.id, {
      characterPath: payload.slug,
      avatarUrl: payload.imageUrl,
    });
  }

  @OnEvent('character.updated')
  async onCharacterUpdated(payload: {
    userId?: string;
    worldId: string;
    isNpc: boolean;
    name?: string;
    slug: string;
    imageUrl?: string;
  }): Promise<void> {
    if (payload.isNpc || !payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      payload.userId,
      payload.worldId,
    );
    if (!membership) return;
    await this.membershipRepo.update(membership.id, {
      characterPath: payload.slug,
      avatarUrl: payload.imageUrl,
    });
  }

  @OnEvent('character.converted')
  async onCharacterConverted(payload: {
    userId?: string;
    worldId: string;
    toNpc: boolean;
    name: string;
    slug: string;
    imageUrl?: string;
  }): Promise<void> {
    if (!payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      payload.userId,
      payload.worldId,
    );
    if (!membership) return;
    if (payload.toNpc) {
      await this.membershipRepo.clearCharacter(membership.id);
    } else {
      await this.membershipRepo.update(membership.id, {
        characterPath: payload.slug,
        avatarUrl: payload.imageUrl,
      });
    }
  }

  @OnEvent('character.deleted')
  async onCharacterDeleted(payload: {
    worldId: string;
    slug: string;
  }): Promise<void> {
    // Postava zanikla → vyčistit characterPath u všech členů, kteří ji měli přiřazenou.
    const members = await this.membershipRepo.findByWorldId(payload.worldId);
    await Promise.all(
      members
        .filter((m) => m.characterPath === payload.slug)
        .map((m) => this.membershipRepo.clearCharacter(m.id)),
    );
  }
}
