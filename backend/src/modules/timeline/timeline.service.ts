import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ITimelineRepository } from './interfaces/timeline-repository.interface';
import type {
  TimelineEvent,
  TimelineEventResponse,
} from './interfaces/timeline-event.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import type { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { WorldCalendarConfigService } from '../world-calendar-config/world-calendar-config.service';
import type { WorldCalendarConfig } from '../world-calendar-config/interfaces/world-calendar-config.interface';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface FindManyArgs {
  worldId: string;
  limit?: number;
  fromYear?: number;
  toYear?: number;
}

export interface TimelineRequester {
  id: string;
  role: UserRole;
  username: string;
}

function stripBase64(url: string | null): string | null {
  if (typeof url === 'string' && url.startsWith('data:')) return null;
  return url;
}

@Injectable()
export class TimelineService {
  constructor(
    @Inject('ITimelineRepository')
    private readonly repo: ITimelineRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    private readonly calendarConfigService: WorldCalendarConfigService,
  ) {}

  private enrich(
    event: TimelineEvent,
    config: WorldCalendarConfig | null,
    preserveImageUrl: boolean,
  ): TimelineEventResponse {
    const celestialStates = config
      ? this.calendarConfigService.calculateCelestialStates(
          event.year,
          event.month,
          event.day,
          config,
          event.celestialOverrides,
        )
      : [];
    return {
      ...event,
      imageUrl: preserveImageUrl ? event.imageUrl : stripBase64(event.imageUrl),
      celestialStates,
    };
  }

  async findMany(
    args: FindManyArgs,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse[]> {
    await this.assertMember(args.worldId, requester);
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    const events = await this.repo.findMany({
      worldId: args.worldId,
      limit,
      fromYear: args.fromYear,
      toYear: args.toYear,
    });
    const config = await this.calendarConfigService.getConfigInternal(
      args.worldId,
    );
    return events.map((e) => this.enrich(e, config, false));
  }

  async findById(
    id: string,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException('Událost nenalezena');
    await this.assertMember(event.worldId, requester);
    const config = await this.calendarConfigService.getConfigInternal(
      event.worldId,
    );
    return this.enrich(event, config, true);
  }

  async create(
    dto: CreateTimelineEventDto,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse> {
    await this.assertCanWrite(dto.worldId, requester);
    const created = await this.repo.create({
      worldId: dto.worldId,
      year: dto.year,
      month: dto.month,
      day: dto.day,
      hour: dto.hour,
      title: dto.title,
      text: dto.text,
      imageUrl: dto.imageUrl ?? null,
      link: dto.link ?? null,
      celestialOverrides: dto.celestialOverrides ?? [],
    });
    const config = await this.calendarConfigService.getConfigInternal(
      dto.worldId,
    );
    return this.enrich(created, config, true);
  }

  async update(
    id: string,
    dto: UpdateTimelineEventDto,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Událost nenalezena');

    // Defense-in-depth proti DTO whitelist bypassu
    if ('worldId' in (dto as Record<string, unknown>)) {
      throw new BadRequestException(
        'worldId je immutable — smaž a vytvoř novou událost pro změnu světa',
      );
    }

    await this.assertCanWrite(existing.worldId, requester);

    // imageUrl: null v body znamená "zachovat stávající" (per parity).
    // hour: null v body znamená "smazat hodinu" (uloží null do DB).
    const patch: Record<string, unknown> = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.text !== undefined && { text: dto.text }),
      ...(dto.year !== undefined && { year: dto.year }),
      ...(dto.month !== undefined && { month: dto.month }),
      ...(dto.day !== undefined && { day: dto.day }),
      ...(dto.hour !== undefined && { hour: dto.hour }),
      ...(dto.link !== undefined && { link: dto.link }),
      ...(dto.celestialOverrides !== undefined && {
        celestialOverrides: dto.celestialOverrides,
      }),
    };
    if (dto.imageUrl !== undefined) {
      patch.imageUrl = dto.imageUrl === null ? existing.imageUrl : dto.imageUrl;
    }

    const updated = await this.repo.update(id, patch);
    if (!updated) throw new NotFoundException('Událost nenalezena');
    const config = await this.calendarConfigService.getConfigInternal(
      updated.worldId,
    );
    return this.enrich(updated, config, true);
  }

  async delete(id: string, requester: TimelineRequester): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Událost nenalezena');
    await this.assertCanWrite(existing.worldId, requester);
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Událost nenalezena');
  }

  /**
   * Read access: member světa (Hrac+, Pending vyloučen).
   * Neexistující svět = 404.
   */
  private async assertMember(
    worldId: string,
    requester: TimelineRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) throw new ForbiddenException('Nejsi členem tohoto světa');
    if (membership.role < WorldRole.Hrac) {
      throw new ForbiddenException('Pending členství nemá přístup');
    }
  }

  /**
   * Write access: Admin/Superadmin shortcut, jinak WorldRole >= PomocnyPJ.
   * Neexistující svět = 404 (per .claude/rules/auth-leak-policy.md — auth-required).
   */
  private async assertCanWrite(
    worldId: string,
    requester: TimelineRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) throw new ForbiddenException('Nedostatečná oprávnění');
    if (membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
  }
}
