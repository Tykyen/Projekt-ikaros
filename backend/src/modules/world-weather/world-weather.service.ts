import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IWeatherGeneratorRepository } from './interfaces/weather-generator-repository.interface';
import type {
  WeatherGenerator,
  WeatherGeneratorConfig,
  WeatherResult,
} from './interfaces/weather-generator.interface';
import type {
  IWeatherHistoryRepository,
  WeatherHistoryEntry,
  WeatherHistoryTrigger,
} from './interfaces/weather-history.interface';
import type {
  CustomWeatherPreset,
  ICustomWeatherPresetRepository,
} from './interfaces/custom-weather-preset.interface';
import { CreateWeatherGeneratorDto } from './dto/create-weather-generator.dto';
import { UpdateWeatherGeneratorDto } from './dto/update-weather-generator.dto';
import { SetCurrentWeatherDto } from './dto/set-current-weather.dto';
import { BroadcastWeatherDto } from './dto/broadcast-weather.dto';
import { ReorderGeneratorsDto } from './dto/reorder-generators.dto';
import { SetInGameDateDto } from './dto/set-in-game-date.dto';
import {
  CreateCustomPresetDto,
  UpdateCustomPresetDto,
} from './dto/custom-weather-preset.dto';
import type { WorldSettings } from '../worlds/interfaces/world-settings.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IWorldSettingsRepository } from '../worlds/interfaces/world-settings-repository.interface';
import type { WorldCalendarConfig } from '../world-calendar-config/interfaces/world-calendar-config.interface';
import type { IWorldCalendarConfigRepository } from '../world-calendar-config/interfaces/world-calendar-config-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { ChatService } from '../chat/chat.service';
import {
  generateTemperature,
  transitionWeatherType,
  type WeatherType,
} from './simulation';

export interface WeatherRequester {
  id: string;
  role: UserRole;
  username: string;
}

@Injectable()
export class WorldWeatherService {
  constructor(
    @Inject('IWeatherGeneratorRepository')
    private readonly repo: IWeatherGeneratorRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldSettingsRepository')
    private readonly worldSettingsRepo: IWorldSettingsRepository,
    @Inject('IWorldCalendarConfigRepository')
    private readonly worldCalendarRepo: IWorldCalendarConfigRepository,
    @Inject(ChatService)
    private readonly chatService: ChatService,
    private readonly eventEmitter: EventEmitter2,
    // 9.4-dluh — custom presets per svět
    @Inject('ICustomWeatherPresetRepository')
    private readonly customPresetRepo: ICustomWeatherPresetRepository,
    // 9.4 dluh #2 — historie počasí (snapshot persistence)
    @Inject('IWeatherHistoryRepository')
    private readonly historyRepo: IWeatherHistoryRepository,
  ) {}

  // ─── Custom presets (9.4-dluh) ─────────────────────────────────────────

  /** List custom presetů světa (member read). */
  async listCustomPresets(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<CustomWeatherPreset[]> {
    await this.assertMember(worldId, requester);
    return this.customPresetRepo.findByWorldId(worldId);
  }

  /** Vytvoř custom preset z aktuální config (PomocnyPJ+). */
  async createCustomPreset(
    worldId: string,
    dto: CreateCustomPresetDto,
    requester: WeatherRequester,
  ): Promise<CustomWeatherPreset> {
    await this.assertCanWrite(worldId, requester);
    this.validateConfig(dto.config as WeatherGeneratorConfig);
    return this.customPresetRepo.save({
      worldId,
      name: dto.name,
      description: dto.description,
      emoji: dto.emoji,
      config: dto.config as WeatherGeneratorConfig,
      createdBy: requester.id,
      usageCount: 0,
    });
  }

  /** Update metadata (name/description/emoji). Config je immutable. */
  async updateCustomPreset(
    worldId: string,
    id: string,
    dto: UpdateCustomPresetDto,
    requester: WeatherRequester,
  ): Promise<CustomWeatherPreset> {
    await this.assertCanWrite(worldId, requester);
    const preset = await this.customPresetRepo.findById(id);
    if (!preset || preset.worldId !== worldId) {
      throw new NotFoundException({
        code: 'CUSTOM_PRESET_NOT_FOUND',
        message: 'Custom preset nenalezen',
      });
    }
    const updated = await this.customPresetRepo.update(id, {
      name: dto.name,
      description: dto.description,
      emoji: dto.emoji,
    });
    return updated!;
  }

  /** Smazat custom preset (PJ+ only — destruktivní akce). */
  async deleteCustomPreset(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<boolean> {
    await this.assertIsPJ(worldId, requester);
    const preset = await this.customPresetRepo.findById(id);
    if (!preset || preset.worldId !== worldId) {
      throw new NotFoundException({
        code: 'CUSTOM_PRESET_NOT_FOUND',
        message: 'Custom preset nenalezen',
      });
    }
    return this.customPresetRepo.delete(id);
  }

  /** Increment usageCount — FE volá při „Použít" v wizardu. PomocnyPJ+. */
  async useCustomPreset(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<CustomWeatherPreset> {
    await this.assertCanWrite(worldId, requester);
    const preset = await this.customPresetRepo.findById(id);
    if (!preset || preset.worldId !== worldId) {
      throw new NotFoundException({
        code: 'CUSTOM_PRESET_NOT_FOUND',
        message: 'Custom preset nenalezen',
      });
    }
    const updated = await this.customPresetRepo.incrementUsage(id);
    return updated!;
  }

  /** Mažu PJ+ — delete custom preset je destruktivní. */
  private async assertIsPJ(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
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
    if (!membership || membership.role < WorldRole.PJ)
      throw new ForbiddenException({
        code: 'CUSTOM_PRESET_FORBIDDEN',
        message: 'Mazání custom presetu vyžaduje PJ',
      });
  }

  async getAll(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator[]> {
    await this.assertMember(worldId, requester);
    return this.repo.findByWorldId(worldId);
  }

  async getOne(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertMember(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException({
        code: 'WEATHER_GENERATOR_NOT_FOUND',
        message: 'Generátor nenalezen',
      });
    return gen;
  }

  async create(
    worldId: string,
    dto: CreateWeatherGeneratorDto,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertCanWrite(worldId, requester);
    this.validateConfig(dto.config as WeatherGeneratorConfig);
    return this.repo.save({
      worldId,
      name: dto.name,
      description: dto.description,
      config: dto.config as WeatherGeneratorConfig,
    });
  }

  async update(
    worldId: string,
    id: string,
    dto: UpdateWeatherGeneratorDto,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException({
        code: 'WEATHER_GENERATOR_NOT_FOUND',
        message: 'Generátor nenalezen',
      });
    if (dto.config) this.validateConfig(dto.config as WeatherGeneratorConfig);
    const updated = await this.repo.update(gen.id, {
      name: dto.name ?? gen.name,
      description: dto.description ?? gen.description,
      config: dto.config ? (dto.config as WeatherGeneratorConfig) : gen.config,
    });
    return updated!;
  }

  async remove(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<boolean> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException({
        code: 'WEATHER_GENERATOR_NOT_FOUND',
        message: 'Generátor nenalezen',
      });
    return this.repo.delete(id);
  }

  /**
   * 9.4-I — přeřadí generátory podle pořadí v `orderedIds`.
   *
   * Validace:
   *  - PomocnyPJ+ (assertCanWrite)
   *  - počet IDs == počet generátorů světa (žádný chybějící, žádný navíc)
   *  - všechny IDs patří do worldId
   *  - žádné duplicity
   *
   * Atomicita: bulkWrite v repo (všechny update v jedné DB operaci).
   */
  async reorder(
    worldId: string,
    dto: ReorderGeneratorsDto,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator[]> {
    await this.assertCanWrite(worldId, requester);
    const existing = await this.repo.findByWorldId(worldId);
    const existingIds = new Set(existing.map((g) => g.id));

    // Duplicity check
    const unique = new Set(dto.orderedIds);
    if (unique.size !== dto.orderedIds.length) {
      throw new BadRequestException({
        code: 'WEATHER_REORDER_DUPLICATE_IDS',
        message: 'orderedIds obsahuje duplicitní záznamy',
      });
    }

    // Count match
    if (dto.orderedIds.length !== existing.length) {
      throw new BadRequestException({
        code: 'WEATHER_REORDER_COUNT_MISMATCH',
        message: `Očekáváno ${existing.length} IDs, dostal jsem ${dto.orderedIds.length}`,
      });
    }

    // Membership check
    for (const id of dto.orderedIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException({
          code: 'WEATHER_REORDER_UNKNOWN_ID',
          message: `Generátor s ID ${id} nepatří do tohoto světa nebo neexistuje`,
        });
      }
    }

    await this.repo.reorder(worldId, dto.orderedIds);
    return this.repo.findByWorldId(worldId);
  }

  private validateConfig(config: WeatherGeneratorConfig): void {
    if (config.tempMin > config.tempMax)
      throw new BadRequestException({
        code: 'WEATHER_INVALID_TEMP_RANGE',
        message: 'tempMin musí být ≤ tempMax',
      });
    if (config.windMin > config.windMax)
      throw new BadRequestException({
        code: 'WEATHER_INVALID_WIND_RANGE',
        message: 'windMin musí být ≤ windMax',
      });
    if (config.pressureMin > config.pressureMax)
      throw new BadRequestException({
        code: 'WEATHER_INVALID_PRESSURE_RANGE',
        message: 'pressureMin musí být ≤ pressureMax',
      });
    if (config.humidityMin > config.humidityMax)
      throw new BadRequestException({
        code: 'WEATHER_INVALID_HUMIDITY_RANGE',
        message: 'humidityMin musí být ≤ humidityMax',
      });
    if (config.windGustMultiplier < 1)
      throw new BadRequestException({
        code: 'WEATHER_INVALID_GUST_MULTIPLIER',
        message: 'windGustMultiplier musí být ≥ 1',
      });
    if (config.weatherTypes && config.weatherTypes.length > 0) {
      const total = config.weatherTypes.reduce((s, t) => s + t.probability, 0);
      // Float arithmetic safety: tolerance ±0.01
      if (Math.abs(total - 100) > 0.01) {
        throw new BadRequestException({
          code: 'WEATHER_INVALID_PROBABILITY_SUM',
          message: `Součet probability weatherTypes musí být 100, je ${total}`,
        });
      }
    }
  }

  /**
   * Read access: member světa (≥ Hrac, Pending vyloučen).
   * Neexistující svět = 404 (auth-required GET).
   */
  private async assertMember(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
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
        message: 'Nejsi členem tohoto světa',
      });
    if (membership.role < WorldRole.Hrac)
      throw new ForbiddenException({
        code: 'PENDING_MEMBERSHIP',
        message: 'Pending členství nemá přístup',
      });
  }

  /**
   * Write access: ≥ PomocnyPJ + Admin/Superadmin shortcut.
   * Neexistující svět = 404 (per .claude/rules/auth-leak-policy.md — auth-required).
   */
  private async assertCanWrite(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
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
    if (!membership || membership.role < WorldRole.PomocnyPJ)
      throw new ForbiddenException({
        code: 'WEATHER_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
  }

  async generate(
    worldId: string,
    id: string,
    requester: WeatherRequester,
    options: {
      monthIndex?: number;
      day?: number;
      seed?: number;
      /** 9.4 dluh #1 — pokud volá advance-day, předá in-game date pro snapshot. */
      inGameDate?: Date | null;
    } = {},
  ): Promise<WeatherGenerator> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException({
        code: 'WEATHER_GENERATOR_NOT_FOUND',
        message: 'Generátor nenalezen',
      });
    const config = gen.config;

    // 9.4 — Calendar context: pokud má svět timelineCalendarSlug, načti config.
    //   Pokud monthIndex/day chybí v options, použij `worldSettings.currentInGameDate`
    //   (set-in-game-date / advance-day) jako fallback před real-world Date.
    const calendarContext = await this.resolveCalendarContext(
      worldId,
      options.monthIndex,
      options.day,
    );

    // 9.4-I / 9.4-J — Variance model:
    //   - Má-li config `monthlyTemps`, použij plnohodnotný variance model (Köppen σ + sezónní interpolace).
    //   - Pokud chybí (BC: staré generátory před 9.4-I, nebo create-bez-presetu),
    //     synth `(tempMin+tempMax)/2 × 12` + `defaultStdDev=4` → Gauss kolem středu místo uniform random.
    //     Pořád ne realistické pro reálné místo, ale rozptyl klesne z [min..max] na úzký Gauss.
    //     Flag `climateModelMissing` v response signalizuje FE, aby zobrazil banner „Opravit klimat".
    const hasClimate = !!(
      config.monthlyTemps && config.monthlyTemps.length > 0
    );
    const climateModelMissing = !hasClimate;
    const monthlyTemps = hasClimate
      ? config.monthlyTemps!
      : Array(12).fill((config.tempMin + config.tempMax) / 2);
    const monthsTotal = monthlyTemps.length;
    const monthIndex = calendarContext.monthIndex % monthsTotal;
    const { temperature, isAnomaly, anomalyType, expectedAvg } =
      generateTemperature({
        monthIndex,
        day: calendarContext.day,
        monthsTotal,
        monthlyTemps,
        monthlyStdDev: hasClimate ? config.monthlyStdDev : undefined,
        defaultStdDev: 4.0,
        seed: options.seed,
      });

    // 9.4-I — Weather type pres Markov persistence pokud máme climateZone + previous state
    let selectedType: (typeof config.weatherTypes)[number];
    if (config.climateZone && gen.currentWeather?.weatherIcon) {
      const prevType = gen.currentWeather.weatherIcon as WeatherType;
      const nextType = transitionWeatherType(prevType, config.climateZone);
      // Najdi odpovídající entry v config.weatherTypes
      const found = config.weatherTypes.find((wt) => wt.type === nextType);
      selectedType = found ?? this.weightedPick(config.weatherTypes);
    } else {
      // Cold start nebo bez climateZone → weighted random
      selectedType = this.weightedPick(config.weatherTypes);
    }

    const cloudValue = Math.round(
      this.randomBetween(
        selectedType.cloudRange[0],
        selectedType.cloudRange[1],
        0,
      ),
    );
    const precipValue = this.randomBetween(
      selectedType.precipRange[0],
      selectedType.precipRange[1],
      1,
    );
    const windSpeed = Math.round(
      this.randomBetween(config.windMin, config.windMax, 0),
    );
    const windGusts = Math.round(windSpeed * config.windGustMultiplier);
    const pressureValue = Math.round(
      this.randomBetween(config.pressureMin, config.pressureMax, 0),
    );
    const humidity = Math.round(
      this.randomBetween(config.humidityMin, config.humidityMax, 0),
    );

    const extras = config.customFields
      .filter((cf) => Math.random() * 100 < cf.probability)
      .map((cf) => ({
        label: cf.label,
        value:
          cf.possibleValues[
            Math.floor(Math.random() * cf.possibleValues.length)
          ],
      }));

    // 9.4 — in-game datum/čas: priorita options.inGameDate > worldSettings.currentInGameDate
    const inGameDateForWeather =
      options.inGameDate ??
      (await this.worldSettingsRepo.findByWorldId(worldId))
        ?.currentInGameDate ??
      null;

    const weather: import('./interfaces/weather-generator.interface').WeatherResult =
      {
        generatedAt: new Date(),
        isManual: false,
        temperature,
        tempUnit: config.tempUnit ?? 'C',
        weatherType: selectedType.label,
        weatherIcon: selectedType.type,
        cloudiness: this.cloudinessText(cloudValue),
        precipitation: this.precipitationText(precipValue),
        wind: { speed: windSpeed, gusts: windGusts, unit: 'kmh' },
        pressure: {
          value: pressureValue,
          trend: this.pressureTrend(pressureValue),
        },
        humidity,
        extras,
        narrativeText: null,
        // 9.4-I — variance + calendar metadata
        isAnomaly,
        anomalyType,
        expectedAvg,
        calendarMonth: calendarContext.calendarMonth,
        // 9.4 — in-game datum (Date) pro UI display místo real-world generatedAt
        inGameDate: inGameDateForWeather,
        // 9.4-J — flag pro FE banner „Opravit klimat"
        climateModelMissing,
      };

    const updated = await this.repo.setCurrentWeather(gen.id, weather);
    // 9.4 dluh #2 — snapshot historie (best-effort, nesmí selhat generate)
    await this.safeAppendSnapshot({
      worldId,
      generatorId: gen.id,
      weather,
      trigger: options.inGameDate ? 'advance-day' : 'generate',
      inGameDate: options.inGameDate ?? null,
    });
    return updated!;
  }

  /**
   * 9.4 — vrátí calendar context pro daný svět + optional explicit monthIndex/day.
   *
   * Priorita pro monthIndex (a obdobně pro day):
   *  1. Pokud `explicitMonthIndex` poskytnut → použij ho (PJ explicit volba: advance-day, set-in-game-date)
   *  2. Pokud má svět `worldSettings.currentInGameDate` → použij měsíc z něj (persisted PJ context)
   *  3. Jinak real-world current month (fallback při fresh světě bez herního času)
   *
   * Calendar mapping: timelineCalendarSlug → custom calendar (N měsíců, vlastní jména),
   *   bez něj Gregorian fallback (12 měsíců).
   */
  private async resolveCalendarContext(
    worldId: string,
    explicitMonthIndex?: number,
    explicitDay?: number,
  ): Promise<{
    monthIndex: number;
    day: number;
    calendarMonth: { name: string; index: number; total: number } | null;
  }> {
    const settings = await this.worldSettingsRepo.findByWorldId(worldId);
    const calendarSlug = settings?.timelineCalendarSlug;
    // 9.4 — pokud world má persisted in-game datum a explicit chybí, použij persisted.
    const persistedDate = settings?.currentInGameDate ?? null;

    // Helper — vrátí default month/day: explicit > persisted > real-world / default 15.
    const pickMonth = (max: number, fallbackMonth: number): number => {
      const raw =
        explicitMonthIndex !== undefined
          ? explicitMonthIndex
          : persistedDate
            ? persistedDate.getUTCMonth()
            : fallbackMonth;
      return ((raw % max) + max) % max;
    };
    const pickDay = (): number => {
      if (explicitDay !== undefined) return explicitDay;
      if (persistedDate) return persistedDate.getUTCDate();
      return 15; // mid-month default
    };

    if (calendarSlug) {
      const config = await this.worldCalendarRepo.findBySlug(
        worldId,
        calendarSlug,
      );
      if (config && config.months.length > 0) {
        const monthsTotal = config.months.length;
        const monthIndex = pickMonth(monthsTotal, new Date().getMonth());
        return {
          monthIndex,
          day: pickDay(),
          calendarMonth: {
            name: config.months[monthIndex].name,
            index: monthIndex,
            total: monthsTotal,
          },
        };
      }
    }

    // Gregorian fallback
    const gregorianMonthNames = [
      'Leden',
      'Únor',
      'Březen',
      'Duben',
      'Květen',
      'Červen',
      'Červenec',
      'Srpen',
      'Září',
      'Říjen',
      'Listopad',
      'Prosinec',
    ];
    const monthIndex = pickMonth(12, new Date().getMonth());
    return {
      monthIndex,
      day: pickDay(),
      calendarMonth: {
        name: gregorianMonthNames[monthIndex],
        index: monthIndex,
        total: 12,
      },
    };
  }

  async setCurrentWeather(
    worldId: string,
    id: string,
    dto: SetCurrentWeatherDto,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException({
        code: 'WEATHER_GENERATOR_NOT_FOUND',
        message: 'Generátor nenalezen',
      });
    // 9.4 — in-game datum z worldSettings (manual override neposílá vlastní inGameDate)
    const manualInGameDate =
      (await this.worldSettingsRepo.findByWorldId(worldId))
        ?.currentInGameDate ?? null;

    const weather: import('./interfaces/weather-generator.interface').WeatherResult =
      {
        generatedAt: new Date(),
        isManual: true,
        temperature: dto.temperature,
        tempUnit: dto.tempUnit,
        weatherType: dto.weatherType,
        weatherIcon: dto.weatherIcon,
        cloudiness: dto.cloudiness,
        precipitation: dto.precipitation,
        wind: { ...dto.wind, unit: dto.wind.unit as 'kmh' },
        pressure: dto.pressure,
        humidity: dto.humidity,
        extras: dto.extras ?? [],
        narrativeText: dto.narrativeText,
        inGameDate: manualInGameDate,
      };
    const updated = await this.repo.setCurrentWeather(gen.id, weather);
    // 9.4 dluh #2 — snapshot historie
    await this.safeAppendSnapshot({
      worldId,
      generatorId: gen.id,
      weather,
      trigger: 'manual',
      inGameDate: null,
    });
    return updated!;
  }

  /**
   * 9.4 dluh #2 — best-effort append do historie. History nesmí selhat
   * generate/setCurrent → log a swallow. Cíl: nikdy nezkrachovat
   * primární operaci kvůli history persistenci.
   */
  private async safeAppendSnapshot(input: {
    worldId: string;
    generatorId: string;
    weather: WeatherResult;
    trigger: WeatherHistoryTrigger;
    inGameDate?: Date | null;
  }): Promise<void> {
    try {
      await this.historyRepo.appendSnapshot(input);
    } catch {
      // Swallow — history je sekundární persistence, primární generate uspěl.
    }
  }

  // ─── 9.4 dluh #2 — Historie počasí ────────────────────────────────────

  /**
   * Vrátí historii snapshotů pro generátor (member read).
   * Sort recordedAt desc + paginace přes `limit`/`offset`.
   * `total` slouží pro „Načíst další" v UI.
   */
  async getHistory(
    worldId: string,
    generatorId: string,
    requester: WeatherRequester,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ items: WeatherHistoryEntry[]; total: number }> {
    await this.assertMember(worldId, requester);
    // Validate that generator exists for this world (auth-leak safe)
    const gen = await this.repo.findById(generatorId);
    if (!gen || gen.worldId !== worldId) {
      throw new NotFoundException({
        code: 'WEATHER_GENERATOR_NOT_FOUND',
        message: 'Generátor nenalezen',
      });
    }
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const [items, total] = await Promise.all([
      this.historyRepo.findByGenerator(worldId, generatorId, limit, offset),
      this.historyRepo.count(worldId, generatorId),
    ]);
    return { items, total };
  }

  // ─── 9.4 — Set explicit in-game date ─────────────────────────────────

  /**
   * 9.4 — PJ explicit nastaví in-game datum světa.
   *
   * Validace:
   *  - PomocnyPJ+ (assertCanWrite)
   *  - Pokud má svět custom kalendář, `monthIndex` musí být v rozsahu
   *    `[0, calendar.months.length)`.
   *
   * Persistence: Date je konstruován jako UTC přes `setUTCFullYear(year, monthIndex, day)`.
   * Pro custom kalendář jde o storage-only Date — generate() interpretuje
   * monthIndex přes `resolveCalendarContext` (calendar.months[monthIndex]).
   *
   * `regenerateAll` (volitelně): vygeneruj počasí pro všechny generátory světa.
   *   Best-effort — selhání jednoho generátoru neshodí celou operaci, jen se
   *   loguje a pokračuje se dál.
   */
  async setInGameDate(
    worldId: string,
    dto: SetInGameDateDto,
    requester: WeatherRequester,
  ): Promise<{
    settings: WorldSettings;
    regenerated: WeatherGenerator[];
  }> {
    await this.assertCanWrite(worldId, requester);

    // 1. Validate calendar context — custom calendar monthIndex bound check
    const settings = await this.worldSettingsRepo.findByWorldId(worldId);
    const calendarSlug = settings?.timelineCalendarSlug ?? null;
    let monthsTotal = 12;
    if (calendarSlug) {
      const cal = await this.worldCalendarRepo.findBySlug(
        worldId,
        calendarSlug,
      );
      if (cal && cal.months.length > 0) monthsTotal = cal.months.length;
    }
    if (dto.monthIndex >= monthsTotal) {
      throw new BadRequestException({
        code: 'WEATHER_INVALID_MONTH',
        message: `monthIndex (${dto.monthIndex}) musí být < monthsTotal (${monthsTotal})`,
      });
    }

    // 2. Construct Date (UTC, supports BCE přes negative year)
    //    Custom kalendář by potřeboval epoch conversion — pro MVP držíme JS Date
    //    jako storage (advance-day + set-in-game-date interpretuje monthIndex
    //    přes calendar.months[]).
    const date = new Date(0); // 1970-01-01 UTC baseline
    date.setUTCFullYear(dto.year, dto.monthIndex, dto.day);
    // 9.4 — Hour/minute optional, default 12:00 (poledne)
    date.setUTCHours(dto.hour ?? 12, dto.minute ?? 0, 0, 0);

    // 3. Persist nový in-game date do worldSettings
    const updatedSettings = await this.worldSettingsRepo.upsert(worldId, {
      currentInGameDate: date,
    });

    // 4. Optionally regenerate weather for all generators
    const regenerated: WeatherGenerator[] = [];
    if (dto.regenerateAll) {
      const generators = await this.repo.findByWorldId(worldId);
      for (const gen of generators) {
        try {
          const updated = await this.generate(worldId, gen.id, requester, {
            monthIndex: dto.monthIndex,
            day: dto.day,
            inGameDate: date,
          });
          regenerated.push(updated);
        } catch {
          // Best-effort — selhání jednoho generátoru neshodí celou operaci.
          // (např. invalid config legacy generátoru). Ostatní generátory pokračují.
        }
      }
    }

    return { settings: updatedSettings, regenerated };
  }

  // ─── 9.4 dluh #1 — Advance-day mechanism ──────────────────────────────

  /**
   * Posune in-game datum světa o `days` (default 1) a vygeneruje počasí
   * pro VŠECHNY generátory světa s odpovídajícím monthIndex.
   *
   * Edge cases:
   *  - currentInGameDate == null → init z `new Date()` (start herního času)
   *  - custom calendar → respektuje měsíce s rozdílným daysCount + epoch year
   *  - přelom roku v custom calendar → roluje rok přes monthsTotal
   *  - Gregorian fallback → standardní `Date.setDate(getDate() + days)`
   *
   * Role gating: PomocnyPJ+ (assertCanWrite).
   */
  async advanceDay(
    worldId: string,
    requester: WeatherRequester,
    days = 1,
  ): Promise<{
    newInGameDate: Date;
    monthIndex: number;
    monthName: string;
    day: number;
    year: number;
    updatedGenerators: WeatherGenerator[];
  }> {
    await this.assertCanWrite(worldId, requester);
    if (days < 1 || days > 365 || !Number.isFinite(days)) {
      throw new BadRequestException({
        code: 'WEATHER_ADVANCE_DAY_INVALID',
        message: 'days musí být v rozsahu 1–365',
      });
    }

    // Načti aktuální in-game date z worldSettings
    const settings = await this.worldSettingsRepo.findByWorldId(worldId);
    const current = settings?.currentInGameDate ?? new Date();
    const calendarSlug = settings?.timelineCalendarSlug ?? null;

    // Načti custom calendar (pokud existuje)
    let calendar: WorldCalendarConfig | null = null;
    if (calendarSlug) {
      calendar = await this.worldCalendarRepo.findBySlug(worldId, calendarSlug);
    }

    // Advance dle calendar typu
    const advanced = calendar
      ? this.advanceCustomCalendar(current, days, calendar)
      : this.advanceGregorianCalendar(current, days);

    // Persist nový in-game date do worldSettings (upsert)
    await this.worldSettingsRepo.upsert(worldId, {
      currentInGameDate: advanced.newDate,
    });

    // Pro každý generátor světa → vygeneruj počasí pro nový měsíc/den
    const generators = await this.repo.findByWorldId(worldId);
    const updated: WeatherGenerator[] = [];
    for (const gen of generators) {
      try {
        const result = await this.generate(worldId, gen.id, requester, {
          monthIndex: advanced.monthIndex,
          day: advanced.day,
          inGameDate: advanced.newDate,
        });
        updated.push(result);
      } catch {
        // Jeden generátor failed → pokračuj (best-effort). Ostatní by neměly
        // selhat kvůli jednomu rozbitému configu.
      }
    }

    return {
      newInGameDate: advanced.newDate,
      monthIndex: advanced.monthIndex,
      monthName: advanced.monthName,
      day: advanced.day,
      year: advanced.year,
      updatedGenerators: updated,
    };
  }

  /**
   * Posune datum dle custom kalendáře. Používá JS Date jako úložiště dnů
   * (`getTime()` epoch ms), ale month/day/year se interpretují přes
   * calendar.months a calendar.epochOffset.
   *
   * Algoritmus:
   *  1. Spočti dayOfYear dnů v aktuálním roce (relative epoch from calendar.epochOffset).
   *  2. Přičti `days`, řeš přelom roku přes monthsTotal × daysCount.
   *  3. Najdi nový month/day/year.
   */
  private advanceCustomCalendar(
    current: Date,
    days: number,
    calendar: WorldCalendarConfig,
  ): {
    newDate: Date;
    monthIndex: number;
    monthName: string;
    day: number;
    year: number;
  } {
    // Pro custom calendar držíme datum jako JS Date, ale month/day/year
    // počítáme přes total dnů od epoch.
    const newDate = new Date(current.getTime());
    newDate.setUTCDate(newDate.getUTCDate() + days);

    // Spočti month/day/year v custom calendar terms.
    // Total dnů v calendar roce
    const daysPerYear = calendar.months.reduce(
      (sum, m) => sum + m.daysCount,
      0,
    );
    // Epoch baseline: epoch = 1970-01-01 v real time, calendar.epochOffset
    // říká kolik dnů od svého epochu byl 1970-01-01.
    const totalDays = Math.floor(newDate.getTime() / 86_400_000);
    const calendarDays = totalDays + (calendar.epochOffset || 0);

    const year = Math.floor(calendarDays / daysPerYear);
    let remaining = calendarDays - year * daysPerYear;
    if (remaining < 0) {
      // Defenzivně — jestli epochOffset způsobí záporné, srovnej.
      remaining += daysPerYear;
    }

    let monthIndex = 0;
    for (let i = 0; i < calendar.months.length; i++) {
      const dc = calendar.months[i].daysCount;
      if (remaining < dc) {
        monthIndex = i;
        break;
      }
      remaining -= dc;
      monthIndex = i + 1;
    }
    // Edge: pokud remaining == daysPerYear (přesný roll), monthIndex = 0 next year
    if (monthIndex >= calendar.months.length) {
      monthIndex = 0;
    }
    const day = remaining + 1; // 1-based

    return {
      newDate,
      monthIndex,
      monthName: calendar.months[monthIndex].name,
      day,
      year,
    };
  }

  /**
   * Posune datum dle Gregorian kalendáře (real-world fallback).
   * Year = getUTCFullYear (real), month 0-11, day 1-31.
   */
  private advanceGregorianCalendar(
    current: Date,
    days: number,
  ): {
    newDate: Date;
    monthIndex: number;
    monthName: string;
    day: number;
    year: number;
  } {
    const newDate = new Date(current.getTime());
    newDate.setUTCDate(newDate.getUTCDate() + days);
    const gregorianMonthNames = [
      'Leden',
      'Únor',
      'Březen',
      'Duben',
      'Květen',
      'Červen',
      'Červenec',
      'Srpen',
      'Září',
      'Říjen',
      'Listopad',
      'Prosinec',
    ];
    const monthIndex = newDate.getUTCMonth();
    return {
      newDate,
      monthIndex,
      monthName: gregorianMonthNames[monthIndex],
      day: newDate.getUTCDate(),
      year: newDate.getUTCFullYear(),
    };
  }

  private weightedPick<T extends { probability: number }>(items: T[]): T {
    const total = items.reduce((s, i) => s + i.probability, 0);
    let rand = Math.random() * total;
    for (const item of items) {
      rand -= item.probability;
      if (rand <= 0) return item;
    }
    return items[items.length - 1];
  }

  private randomBetween(min: number, max: number, decimals: number): number {
    const val = min + Math.random() * (max - min);
    return parseFloat(val.toFixed(decimals));
  }

  private cloudinessText(value: number): {
    value: string;
    description: string;
  } {
    if (value === 0)
      return { value: '0/8 Jasno', description: 'Obloha bez mraků' };
    if (value <= 2)
      return {
        value: `${value}/8 Skoro jasno`,
        description: 'Ojedinělá oblačnost',
      };
    if (value <= 4)
      return {
        value: `${value}/8 Polojasno`,
        description: 'Proměnlivá oblačnost',
      };
    if (value <= 6)
      return {
        value: `${value}/8 Oblačno`,
        description: 'Převážně oblačno',
      };
    if (value === 7)
      return {
        value: '7/8 Převážně zataženo',
        description: 'Obloha z větší části zakrytá',
      };
    return { value: '8/8 Zataženo', description: 'Obloha úplně zakrytá' };
  }

  private precipitationText(mmPerHour: number): {
    value: string;
    description: string;
  } {
    if (mmPerHour === 0) return { value: 'Beze srážek', description: '' };
    if (mmPerHour <= 2)
      return {
        value: 'Slabé srážky',
        description: 'Mírný déšť nebo mrholení',
      };
    if (mmPerHour <= 10)
      return { value: 'Střední srážky', description: 'Pravidelný déšť' };
    return {
      value: 'Silné srážky',
      description: 'Intenzivní srážky nebo bouřka',
    };
  }

  private pressureTrend(hpa: number): string {
    // Per spec: >1015 = Stabilní, 1000-1015 = Mírný pokles, <1000 = Silný pokles.
    if (hpa > 1015) return 'Stabilní';
    if (hpa >= 1000) return 'Mírný pokles';
    return 'Silný pokles';
  }

  async broadcast(
    worldId: string,
    id: string,
    dto: BroadcastWeatherDto,
    requester: WeatherRequester,
  ): Promise<void> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException({
        code: 'WEATHER_GENERATOR_NOT_FOUND',
        message: 'Generátor nenalezen',
      });
    if (!gen.currentWeather) {
      throw new ConflictException(
        'Generátor nemá aktuální počasí. Nejdříve zavolejte /generate nebo /current.',
      );
    }

    const w = gen.currentWeather;
    if (dto.target === 'chat') {
      if (!dto.channelId)
        throw new BadRequestException(
          'channelId je povinný pro broadcast do chatu',
        );
      const content = this.formatWeatherForChat(gen.name, w);
      await this.chatService.createSystemMessage(
        dto.channelId,
        worldId,
        content,
        `Počasí — ${gen.name}`,
      );
    } else {
      this.eventEmitter.emit('weather.updated', {
        worldId,
        generatorId: gen.id,
        generatorName: gen.name,
        weather: w,
      });
    }
  }

  private formatWeatherForChat(
    generatorName: string,
    w: import('./interfaces/weather-generator.interface').WeatherResult,
  ): string {
    const lines = [
      `**${generatorName}** — ${w.weatherType}`,
      `Teplota: ${w.temperature > 0 ? '+' : ''}${w.temperature}°${w.tempUnit}`,
      `Oblačnost: ${w.cloudiness.value}`,
      `Srážky: ${w.precipitation.value}`,
      `Vítr: ${w.wind.speed} km/h (nárazy ${w.wind.gusts} km/h)`,
      `Tlak: ${w.pressure.value} hPa — ${w.pressure.trend} | Vlhkost: ${w.humidity}%`,
    ];
    if (w.extras.length > 0) {
      lines.push('');
      for (const extra of w.extras) {
        lines.push(
          `${extra.label}: ${extra.value}${extra.description ? ` — ${extra.description}` : ''}`,
        );
      }
    }
    if (w.narrativeText) {
      lines.push('');
      lines.push(w.narrativeText);
    }
    return lines.join('\n');
  }

  async seedDefaultForWorld(worldId: string, genre: string): Promise<void> {
    const config = this.defaultConfigForGenre(genre);
    await this.repo.save({ worldId, name: 'Výchozí prostředí', config });
  }

  private defaultConfigForGenre(genre: string): WeatherGeneratorConfig {
    const base: WeatherGeneratorConfig = {
      tempUnit: 'C',
      windMin: 0,
      windMax: 50,
      windGustMultiplier: 2.0,
      pressureMin: 980,
      pressureMax: 1030,
      humidityMin: 20,
      humidityMax: 90,
      customFields: [],
      weatherTypes: [
        {
          type: 'clear',
          label: 'Jasno',
          icon: 'clear',
          probability: 30,
          cloudRange: [0, 1],
          precipRange: [0, 0],
        },
        {
          type: 'cloudy',
          label: 'Zataženo',
          icon: 'cloudy',
          probability: 40,
          cloudRange: [5, 8],
          precipRange: [0, 0],
        },
        {
          type: 'rain',
          label: 'Déšť',
          icon: 'rain',
          probability: 20,
          cloudRange: [6, 8],
          precipRange: [1, 8],
        },
        {
          type: 'storm',
          label: 'Bouřka',
          icon: 'storm',
          probability: 10,
          cloudRange: [7, 8],
          precipRange: [8, 20],
        },
      ],
      tempMin: 0,
      tempMax: 25,
    };
    // Genre detection — pattern stejný jako WorldCurrenciesService.seedForWorld
    const fantasy = [
      'fantasy',
      'dark-fantasy',
      'heroic-fantasy',
      'sword-sorcery',
      'grimdark',
      'mytologicky',
    ];
    const cyber = [
      'cyberpunk',
      'sci-fi',
      'hard-sci-fi',
      'soft-sci-fi',
      'biopunk',
    ];
    const space = ['space-opera', 'military'];
    const postapo = ['postapo', 'post-postapo', 'dieselpunk'];

    if (fantasy.includes(genre)) {
      base.tempMin = -5;
      base.tempMax = 30;
    } else if (cyber.includes(genre)) {
      base.tempMin = -60;
      base.tempMax = 60;
      base.humidityMin = 0;
      base.humidityMax = 30;
    } else if (space.includes(genre)) {
      base.tempMin = -100;
      base.tempMax = 50;
      base.humidityMin = 0;
      base.humidityMax = 20;
    } else if (postapo.includes(genre)) {
      base.tempMin = -10;
      base.tempMax = 45;
      base.humidityMin = 5;
      base.humidityMax = 60;
    }
    return base;
  }
}
