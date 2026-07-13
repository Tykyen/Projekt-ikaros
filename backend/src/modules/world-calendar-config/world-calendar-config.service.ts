import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { IWorldCalendarConfigRepository } from './interfaces/world-calendar-config-repository.interface';
import type {
  WorldCalendarConfig,
  CelestialState,
  CelestialOverride,
} from './interfaces/world-calendar-config.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IWorldSettingsRepository } from '../worlds/interfaces/world-settings-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateWorldCalendarConfigDto } from './dto/create-world-calendar-config.dto';
import type { PatchWorldCalendarConfigDto } from './dto/patch-world-calendar-config.dto';
import { calculateCelestialStates } from './world-calendar-config.utils';
import { GREGORIAN_DEFAULT_TEMPLATE } from './gregorian-default';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import { assertUnderCreationLimit } from '../../common/limits/creation-limits';

export interface CalendarConfigRequester {
  id: string;
  role: UserRole;
  username: string;
  elevatedWorldIds?: string[];
}

@Injectable()
export class WorldCalendarConfigService {
  constructor(
    @Inject('IWorldCalendarConfigRepository')
    private readonly repo: IWorldCalendarConfigRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldSettingsRepository')
    private readonly worldSettingsRepo: IWorldSettingsRepository,
  ) {}

  // ── Public API ────────────────────────────────────────────────────

  async list(
    worldId: string,
    requester: CalendarConfigRequester,
  ): Promise<WorldCalendarConfig[]> {
    await this.assertMember(worldId, requester);
    return this.repo.findAllByWorldId(worldId);
  }

  async getBySlug(
    worldId: string,
    slug: string,
    requester: CalendarConfigRequester,
  ): Promise<WorldCalendarConfig> {
    await this.assertMember(worldId, requester);
    const config = await this.repo.findBySlug(worldId, slug);
    if (!config)
      throw new NotFoundException({
        code: 'CALENDAR_CONFIG_NOT_FOUND',
        message: 'Kalendář nenalezen',
      });
    return config;
  }

  async create(
    worldId: string,
    dto: CreateWorldCalendarConfigDto,
    requester: CalendarConfigRequester,
  ): Promise<WorldCalendarConfig> {
    await this.assertCanWrite(worldId, requester);
    // D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: kumulativní strop
    // kalendářů per svět (seed při tvorbě světa je bounded @ArrayMaxSize(20)).
    assertUnderCreationLimit(
      await this.repo.countByWorldId(worldId),
      'MAX_CALENDARS_PER_WORLD',
      'kalendářů ve světě',
    );
    this.validateMonthsAndSeasons(dto.months, dto.seasons);

    const data = {
      slug: dto.slug,
      name: dto.name,
      hoursPerDay: dto.hoursPerDay ?? 24,
      daysOfWeek: dto.daysOfWeek ?? [],
      months: dto.months ?? [],
      celestialBodies: dto.celestialBodies ?? [],
      seasons: dto.seasons ?? [],
      // 9.3-F-I — opt-in leap pravidlo
      ...(dto.leapYearRule ? { leapYearRule: dto.leapYearRule } : {}),
      // 9.3-F-II — opt-in lunisolar pravidlo
      ...(dto.lunisolar ? { lunisolar: dto.lunisolar } : {}),
      epochOffset: dto.epochOffset ?? 0,
    };

    const created = await this.repo.create(worldId, data);
    if (!created)
      throw new ConflictException({
        code: 'SLUG_TAKEN',
        message: `Kalendář se slugem '${dto.slug}' už ve světě existuje.`,
      });
    return created;
  }

  async patch(
    worldId: string,
    slug: string,
    dto: PatchWorldCalendarConfigDto,
    requester: CalendarConfigRequester,
  ): Promise<WorldCalendarConfig> {
    await this.assertCanWrite(worldId, requester);
    // FIX-62 — PATCH jen `{seasons}` (bez `months`) musí validovat proti
    // STÁVAJÍCÍM měsícům configu; dřív `!dto.months` → validace se rovnou
    // přeskočila → SEASON_OUT_OF_RANGE nikdy neproběhlo na season-only patch.
    const monthsForValidation =
      dto.months ??
      (dto.seasons
        ? (await this.repo.findBySlug(worldId, slug))?.months
        : undefined);
    this.validateMonthsAndSeasons(monthsForValidation, dto.seasons);

    const patched = await this.repo.patch(worldId, slug, {
      name: dto.name,
      hoursPerDay: dto.hoursPerDay,
      daysOfWeek: dto.daysOfWeek,
      months: dto.months,
      celestialBodies: dto.celestialBodies,
      seasons: dto.seasons,
      // 9.3-F-I — `null` v patch = clear leapYearRule (cast přes unknown,
      // repo predá $set s `null` → Mongoose unset semantika)
      ...(dto.leapYearRule !== undefined && {
        leapYearRule: dto.leapYearRule as never,
      }),
      // 9.3-F-II — stejný null clearing pattern pro lunisolar
      ...(dto.lunisolar !== undefined && {
        lunisolar: dto.lunisolar as never,
      }),
      epochOffset: dto.epochOffset,
    });
    if (!patched)
      throw new NotFoundException({
        code: 'CALENDAR_CONFIG_NOT_FOUND',
        message: 'Kalendář nenalezen',
      });
    return patched;
  }

  async remove(
    worldId: string,
    slug: string,
    requester: CalendarConfigRequester,
  ): Promise<void> {
    await this.assertCanWrite(worldId, requester);
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (world.defaultCalendarConfigSlug === slug)
      throw new ForbiddenException({
        code: 'DEFAULT_CONFIG_LOCKED',
        message:
          'Nelze smazat default kalendář. Nejprve nastav jiný jako default.',
      });
    const removed = await this.repo.remove(worldId, slug);
    if (!removed)
      throw new NotFoundException({
        code: 'CALENDAR_CONFIG_NOT_FOUND',
        message: 'Kalendář nenalezen',
      });
    // CD-RUN-2 — smazaný config mohl být zvolen jako timeline/weather kalendář
    // (`worldSettings.timelineCalendarSlug`). Vynuluj dangling odkaz, jinak na
    // něj `getTimelineConfig` ukazuje (řeší to sice fallbackem na default, ale
    // ten odkaz zůstane viset, dokud ho PJ ručně nepřenastaví).
    const settings = await this.worldSettingsRepo.findByWorldId(worldId);
    if (settings?.timelineCalendarSlug === slug) {
      await this.worldSettingsRepo.upsert(worldId, {
        timelineCalendarSlug: null,
      });
    }
  }

  /**
   * 9.3-F-I — internal seed pro `worlds.service.create()` (PJ vize Q1).
   *
   * Bypasses auth: svět právě vznikl, owner = caller (implicit PJ rights).
   * Idempotent: pokud `slug` už existuje (race condition), vrátí existing.
   * Použito pro každý preset z `CreateWorldDto.calendars[]`.
   */
  async applyPresetTemplate(
    worldId: string,
    dto: CreateWorldCalendarConfigDto,
  ): Promise<WorldCalendarConfig> {
    const existing = await this.repo.findBySlug(worldId, dto.slug);
    if (existing) return existing;
    this.validateMonthsAndSeasons(dto.months, dto.seasons);
    const created = await this.repo.create(worldId, {
      slug: dto.slug,
      name: dto.name,
      hoursPerDay: dto.hoursPerDay ?? 24,
      daysOfWeek: dto.daysOfWeek ?? [],
      months: dto.months ?? [],
      celestialBodies: dto.celestialBodies ?? [],
      seasons: dto.seasons ?? [],
      ...(dto.leapYearRule ? { leapYearRule: dto.leapYearRule } : {}),
      // 9.3-F-II — opt-in lunisolar pravidlo
      ...(dto.lunisolar ? { lunisolar: dto.lunisolar } : {}),
      epochOffset: dto.epochOffset ?? 0,
    });
    if (!created) {
      // Race (duplicate slug) — re-fetch.
      const refetch = await this.repo.findBySlug(worldId, dto.slug);
      if (!refetch)
        throw new Error(
          `applyPresetTemplate: slug=${dto.slug} race re-fetch failed`,
        );
      return refetch;
    }
    return created;
  }

  /**
   * 9.2b — auto-seed Gregorian default při novém světě.
   * Volá se z `worlds.service.create()` po insertu World docu.
   * Idempotent: pokud `slug: 'gregorian'` už existuje, vrátí existující.
   */
  async seedGregorianDefault(worldId: string): Promise<WorldCalendarConfig> {
    const existing = await this.repo.findBySlug(worldId, 'gregorian');
    if (existing) return existing;
    const created = await this.repo.create(worldId, GREGORIAN_DEFAULT_TEMPLATE);
    if (!created) {
      // Race condition — někdo jiný vytvořil mezi find a create. Re-fetch.
      const refetch = await this.repo.findBySlug(worldId, 'gregorian');
      if (!refetch)
        throw new Error('Gregorian seed failed and refetch returned null');
      return refetch;
    }
    return created;
  }

  // ── Internal API (cross-module: timeline) ─────────────────────────

  /** Bypasses auth — caller has authorization. Slug optional → default. */
  async getConfigInternal(
    worldId: string,
    slug?: string,
  ): Promise<WorldCalendarConfig | null> {
    if (slug) return this.repo.findBySlug(worldId, slug);
    const world = await this.worldsRepo.findById(worldId);
    if (!world) return null;
    return this.repo.findBySlug(worldId, world.defaultCalendarConfigSlug);
  }

  /**
   * 9.3 — getter specifický pro **timeline modul**. Záměrně samostatný, aby
   * `getConfigInternal` (sdílený s 9.2 a budoucím 9.4) zůstal netknutý.
   *
   * Priorita (9.3-followup-FIX 2026-05-25):
   * 1. `worldSettings.timelineCalendarSlug` set + config existuje → vrátí ho
   * 2. `world.defaultCalendarConfigSlug` (= ⭐ default svět) — konzistentní
   *    s ostatními moduly (9.2 kalendář, 9.4 počasí, 9.5 novinky)
   * 3. Posledně `configs[0]` — pojistka pokud i default chybí (rozbitý stav)
   * 4. Svět nemá žádný config → `null`
   */
  async getTimelineConfig(
    worldId: string,
  ): Promise<WorldCalendarConfig | null> {
    const configs = await this.repo.findAllByWorldId(worldId);
    if (!configs.length) return null;

    // 1) explicit volba timeline
    const settings = await this.worldSettingsRepo.findByWorldId(worldId);
    const timelineSlug = settings?.timelineCalendarSlug ?? null;
    if (timelineSlug) {
      const match = configs.find((c) => c.slug === timelineSlug);
      if (match) return match;
    }

    // 2) default svět (⭐ Hvězda v CalendarConfigsPage)
    const world = await this.worldsRepo.findById(worldId);
    const defaultSlug = world?.defaultCalendarConfigSlug;
    if (defaultSlug) {
      const match = configs.find((c) => c.slug === defaultSlug);
      if (match) return match;
    }

    // 3) pojistka — první config (rozbitý stav, ale alespoň něco)
    return configs[0];
  }

  calculateCelestialStates(
    year: number,
    monthIndex: number,
    day: number,
    config: WorldCalendarConfig,
    overrides: CelestialOverride[],
  ): CelestialState[] {
    return calculateCelestialStates(year, monthIndex, day, config, overrides);
  }

  // ── Validation ────────────────────────────────────────────────────

  /**
   * FIX-62 — bere `months`/`seasons` už MERGED (volající zodpovídá za merge s
   * existujícím configem, když PATCH `months` neposílá) — jinak `{seasons}`-only
   * patch obchází kontrolu (viz `patch()`).
   */
  private validateMonthsAndSeasons(
    months: { name: string; daysCount: number }[] | undefined,
    seasons?: { startMonthIndex: number; startDay: number }[],
  ): void {
    if (!months || months.length === 0) return;
    const monthCount = months.length;

    if (seasons) {
      for (const season of seasons) {
        if (
          season.startMonthIndex < 0 ||
          season.startMonthIndex >= monthCount
        ) {
          throw new BadRequestException({
            code: 'SEASON_OUT_OF_RANGE',
            message: `Sezóna startMonthIndex ${season.startMonthIndex} mimo rozsah 0..${monthCount - 1}`,
          });
        }
        const monthDef = months[season.startMonthIndex];
        if (season.startDay < 1 || season.startDay > monthDef.daysCount) {
          throw new BadRequestException({
            code: 'SEASON_DAY_OUT_OF_RANGE',
            message: `Sezóna startDay ${season.startDay} mimo rozsah 1..${monthDef.daysCount}`,
          });
        }
      }
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────

  private async assertMember(
    worldId: string,
    requester: CalendarConfigRequester,
  ): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership)
      throw new ForbiddenException({
        code: 'NOT_WORLD_MEMBER',
        message: 'Nejsi členem',
      });
    if (membership.role < WorldRole.Hrac) {
      throw new ForbiddenException({
        code: 'PENDING_WORLD_MEMBERSHIP',
        message: 'Pending členství',
      });
    }
  }

  private async assertCanWrite(
    worldId: string,
    requester: CalendarConfigRequester,
  ): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException({
        code: 'NOT_WORLD_HELPER_PJ',
        message: 'Nedostatečná oprávnění',
      });
    }
  }
}
