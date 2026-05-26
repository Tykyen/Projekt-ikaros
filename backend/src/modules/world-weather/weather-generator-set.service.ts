// backend/src/modules/world-weather/weather-generator-set.service.ts

import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { IWeatherGeneratorSetRepository } from './interfaces/weather-generator-set.interface';
import type { WeatherGeneratorSet } from './interfaces/weather-generator-set.interface';
import type {
  WeatherGenerator,
  WeatherGeneratorConfig,
} from './interfaces/weather-generator.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import {
  WorldWeatherService,
  type WeatherRequester,
} from './world-weather.service';
import {
  CreateWeatherGeneratorSetDto,
  UpdateWeatherGeneratorSetDto,
  ApplySetDto,
} from './dto/weather-generator-set.dto';

/**
 * 9.4 Weather Generator Set service.
 *
 * Responsibilities:
 *  - CRUD per svět (PomocnyPJ+ write, member read, PJ+ delete)
 *  - Apply set: FE pošle resolvedItems s configy → BE vytvoří N generátorů
 *    a inkrementuje `appliedCount`.
 *
 * Apply protokol (FE-resolve):
 *  Preset catalog (archetype / country / city / extreme / custom) je
 *  FE-side. BE neumí mapovat `presetId` → config. Proto apply endpoint
 *  vyžaduje, aby FE poslal `resolvedItems[].config` (= výsledek mapování
 *  z katalogu). BE validuje config přes `WorldWeatherService.create()`
 *  a v případě validation erroru selže celé apply (atomicita best-effort
 *  — first failure rolls forward bez rollbacku už vytvořených generátorů,
 *  ale FE typicky validuje předem).
 */
@Injectable()
export class WeatherGeneratorSetService {
  constructor(
    @Inject('IWeatherGeneratorSetRepository')
    private readonly repo: IWeatherGeneratorSetRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    private readonly weatherService: WorldWeatherService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async list(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<WeatherGeneratorSet[]> {
    await this.assertMember(worldId, requester);
    return this.repo.findByWorldId(worldId);
  }

  async getOne(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<WeatherGeneratorSet> {
    await this.assertMember(worldId, requester);
    const set = await this.repo.findById(id);
    if (!set || set.worldId !== worldId) {
      throw new NotFoundException({
        code: 'WEATHER_SET_NOT_FOUND',
        message: 'Set nenalezen',
      });
    }
    return set;
  }

  async create(
    worldId: string,
    dto: CreateWeatherGeneratorSetDto,
    requester: WeatherRequester,
  ): Promise<WeatherGeneratorSet> {
    await this.assertCanWrite(worldId, requester);
    if (!dto.items || dto.items.length === 0) {
      // class-validator obvykle chytne dřív, ale defense-in-depth.
      throw new BadRequestException({
        code: 'WEATHER_SET_EMPTY_ITEMS',
        message: 'Set musí mít alespoň jednu položku',
      });
    }
    return this.repo.save({
      worldId,
      name: dto.name,
      description: dto.description,
      emoji: dto.emoji,
      items: dto.items.map((it) => ({
        presetId: it.presetId,
        generatorName: it.generatorName,
        description: it.description,
      })),
      createdBy: requester.id,
    });
  }

  async update(
    worldId: string,
    id: string,
    dto: UpdateWeatherGeneratorSetDto,
    requester: WeatherRequester,
  ): Promise<WeatherGeneratorSet> {
    await this.assertCanWrite(worldId, requester);
    const existing = await this.repo.findById(id);
    if (!existing || existing.worldId !== worldId) {
      throw new NotFoundException({
        code: 'WEATHER_SET_NOT_FOUND',
        message: 'Set nenalezen',
      });
    }
    if (dto.items !== undefined && dto.items.length === 0) {
      throw new BadRequestException({
        code: 'WEATHER_SET_EMPTY_ITEMS',
        message: 'Set musí mít alespoň jednu položku',
      });
    }
    const updated = await this.repo.update(id, {
      name: dto.name,
      description: dto.description,
      emoji: dto.emoji,
      items: dto.items?.map((it) => ({
        presetId: it.presetId,
        generatorName: it.generatorName,
        description: it.description,
      })),
    });
    return updated!;
  }

  async remove(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<boolean> {
    await this.assertIsPJ(worldId, requester);
    const existing = await this.repo.findById(id);
    if (!existing || existing.worldId !== worldId) {
      throw new NotFoundException({
        code: 'WEATHER_SET_NOT_FOUND',
        message: 'Set nenalezen',
      });
    }
    return this.repo.delete(id);
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  /**
   * Aplikuj set — vytvoří N generátorů z `resolvedItems` (FE pre-resolved
   * configy) a inkrementuje `appliedCount`.
   *
   * FE protokol: FE musí poslat resolvedItems (preset catalog je FE-side).
   * Pokud array prázdný nebo chybí → 400 (class-validator).
   *
   * Error handling: pokud `weatherService.create()` selže (např. invalid
   * config), exception probublá. Už vytvořené generátory zůstanou (žádný
   * rollback) — FE musí validovat configy předem nebo akceptovat partial.
   * appliedCount se inkrementuje jen pokud všechno projde.
   */
  async apply(
    worldId: string,
    setId: string,
    dto: ApplySetDto,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator[]> {
    await this.assertCanWrite(worldId, requester);
    const set = await this.repo.findById(setId);
    if (!set || set.worldId !== worldId) {
      throw new NotFoundException({
        code: 'WEATHER_SET_NOT_FOUND',
        message: 'Set nenalezen',
      });
    }
    if (!dto.resolvedItems || dto.resolvedItems.length === 0) {
      throw new BadRequestException({
        code: 'WEATHER_SET_APPLY_EMPTY',
        message:
          'resolvedItems musí mít alespoň jednu položku (FE musí rozresolveovat presety před apply)',
      });
    }

    const created: WeatherGenerator[] = [];
    for (const item of dto.resolvedItems) {
      const generator = await this.weatherService.create(
        worldId,
        {
          name: item.name,
          description: item.description,
          // Cast: WorldWeatherService.create() interně castuje na
          // WeatherGeneratorConfig a validuje ranges (validateConfig).
          config: item.config as unknown as WeatherGeneratorConfig,
        },
        requester,
      );
      created.push(generator);
    }

    await this.repo.incrementAppliedCount(setId);
    return created;
  }

  // ─── Auth helpers ─────────────────────────────────────────────────────────

  /** Read access: member světa (≥ Hrac). */
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

  /** Write access: ≥ PomocnyPJ. */
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
        code: 'WEATHER_SET_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
  }

  /** Delete je destruktivní → PJ+ only. */
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
        code: 'WEATHER_SET_FORBIDDEN',
        message: 'Mazání setu vyžaduje PJ',
      });
  }
}
