import {
  BadRequestException,
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
  SunConfig,
  CelestialBody,
} from './interfaces/world-calendar-config.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { UpsertWorldCalendarConfigDto } from './dto/upsert-world-calendar-config.dto';
import { calculateCelestialStates } from './world-calendar-config.utils';

export interface CalendarConfigRequester {
  id: string;
  role: UserRole;
  username: string;
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
  ) {}

  async getConfig(
    worldId: string,
    requester: CalendarConfigRequester,
  ): Promise<WorldCalendarConfig | null> {
    await this.assertMember(worldId, requester);
    return this.repo.findByWorldId(worldId);
  }

  /**
   * Internal API for cross-module calls (e.g., TimelineService retrofit).
   * Bypasses auth — caller already has authorization for the operation.
   */
  async getConfigInternal(
    worldId: string,
  ): Promise<WorldCalendarConfig | null> {
    return this.repo.findByWorldId(worldId);
  }

  async upsertConfig(
    worldId: string,
    dto: UpsertWorldCalendarConfigDto,
    requester: CalendarConfigRequester,
  ): Promise<WorldCalendarConfig> {
    await this.assertCanWrite(worldId, requester);

    const months = dto.months ?? [];
    const monthCount = months.length;

    // Sun config validation
    for (const body of dto.celestialBodies ?? []) {
      if (body.type === 'sun') {
        if (monthCount < 1) {
          throw new BadRequestException(
            'Sluneční těleso vyžaduje alespoň jeden měsíc v kalendáři',
          );
        }
        const sun = body.config as unknown as SunConfig;
        if (
          (sun.riseHour?.length ?? 0) !== monthCount ||
          (sun.setHour?.length ?? 0) !== monthCount
        ) {
          throw new BadRequestException(
            'SunConfig riseHour a setHour musí odpovídat počtu měsíců',
          );
        }
      }
    }

    // referenceDate validation
    if (dto.referenceDate) {
      const { month, day, hour } = dto.referenceDate;
      if (month < 1 || month > monthCount) {
        throw new BadRequestException(
          `referenceDate.month ${month} mimo rozsah 1..${monthCount}`,
        );
      }
      const monthDef = months[month - 1];
      if (day < 1 || day > monthDef.daysCount) {
        throw new BadRequestException(
          `referenceDate.day ${day} mimo rozsah 1..${monthDef.daysCount}`,
        );
      }
      const hoursPerDay = dto.hoursPerDay ?? 24;
      if (hour < 0 || hour >= hoursPerDay) {
        throw new BadRequestException(
          `referenceDate.hour ${hour} mimo rozsah 0..${hoursPerDay - 1}`,
        );
      }
    }

    const bodies: CelestialBody[] = (dto.celestialBodies ?? []).map((b) => ({
      id: b.id ?? crypto.randomUUID(),
      name: b.name,
      type: b.type,
      config: b.config as unknown as CelestialBody['config'],
      referenceState: b.referenceState,
    }));

    return this.repo.upsert(worldId, {
      hoursPerDay: dto.hoursPerDay ?? 24,
      daysOfWeek: dto.daysOfWeek ?? [],
      months,
      celestialBodies: bodies,
      referenceDate: dto.referenceDate ?? null,
    });
  }

  /** Public API used by Timeline retrofit (Task 6) */
  calculateCelestialStates(
    year: number,
    month: number,
    day: number,
    config: WorldCalendarConfig,
    overrides: CelestialOverride[],
  ): CelestialState[] {
    return calculateCelestialStates(year, month, day, config, overrides);
  }

  private async assertMember(
    worldId: string,
    requester: CalendarConfigRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) throw new ForbiddenException('Nejsi členem');
    if (membership.role < WorldRole.Hrac) {
      throw new ForbiddenException('Pending členství');
    }
  }

  private async assertCanWrite(
    worldId: string,
    requester: CalendarConfigRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
  }
}
