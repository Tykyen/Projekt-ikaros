import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import {
  decodeCursor,
  encodeCursor,
  type TimelineSort,
} from './lib/timeline-cursor';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface FindManyArgs {
  worldId: string;
  limit?: number;
  fromYear?: number;
  toYear?: number;
  /** 9.3 — case-insensitive search v title+text (regex escape v repo). */
  search?: string;
  /** 9.3 — opaque base64url cursor z předchozí stránky. */
  cursor?: string;
  /** 9.3 — pořadí, default `desc`. */
  sort?: TimelineSort;
}

export interface TimelinePageResponse {
  events: TimelineEventResponse[];
  /** Opaque cursor pro další stránku, nebo `null` pokud žádná. */
  nextCursor: string | null;
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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private enrich(
    event: TimelineEvent,
    config: WorldCalendarConfig | null,
    preserveImageUrl: boolean,
  ): TimelineEventResponse {
    const celestialStates = config
      ? this.calendarConfigService.calculateCelestialStates(
          event.year,
          // 9.2b — utils používá 0-based monthIndex, timeline 1-based month.
          event.month - 1,
          event.day,
          config,
          event.celestialOverrides,
        )
      : [];
    return {
      ...event,
      // F-02 — read-time sanitizace jako druhá obrana: očistí i záznamy uložené
      // PŘED zavedením write-sanitizace (bez nutnosti migrace produkční DB).
      // Idempotentní vůči už sanitizovaným (write) textům.
      text: sanitizeRichText(event.text),
      imageUrl: preserveImageUrl ? event.imageUrl : stripBase64(event.imageUrl),
      celestialStates,
    };
  }

  async findMany(
    args: FindManyArgs,
    requester: TimelineRequester,
  ): Promise<TimelinePageResponse> {
    await this.assertMember(args.worldId, requester);
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    const cursor = args.cursor ? decodeCursor(args.cursor) : undefined;
    const page = await this.repo.findMany({
      worldId: args.worldId,
      limit,
      fromYear: args.fromYear,
      toYear: args.toYear,
      search: args.search,
      cursor,
      sort: args.sort ?? 'desc',
    });
    const config = await this.calendarConfigService.getTimelineConfig(
      args.worldId,
    );
    return {
      events: page.events.map((e) => this.enrich(e, config, false)),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    };
  }

  async yearCounts(
    worldId: string,
    requester: TimelineRequester,
  ): Promise<Array<{ year: number; count: number }>> {
    await this.assertMember(worldId, requester);
    return this.repo.yearCounts(worldId);
  }

  async findById(
    id: string,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse> {
    const event = await this.repo.findById(id);
    if (!event)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Událost nenalezena',
      });
    await this.assertMember(event.worldId, requester);
    const config = await this.calendarConfigService.getTimelineConfig(
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
      // F-02 — rich-text `text` se renderuje přes dangerouslySetInnerHTML
      // (TimelineEventCard) → sanitizace na write (allowlist, jako pages/articles).
      text: sanitizeRichText(dto.text),
      imageUrl: dto.imageUrl ?? null,
      imageFocalX: dto.imageFocalX ?? null,
      imageFocalY: dto.imageFocalY ?? null,
      link: dto.link ?? null,
      pageSlug: dto.pageSlug ?? null,
      celestialOverrides: dto.celestialOverrides ?? [],
    });
    const config = await this.calendarConfigService.getTimelineConfig(
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
    if (!existing)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Událost nenalezena',
      });

    // Defense-in-depth proti DTO whitelist bypassu
    if ('worldId' in (dto as Record<string, unknown>)) {
      throw new BadRequestException({
        code: 'EVENT_WORLD_IMMUTABLE',
        message:
          'worldId je immutable — smaž a vytvoř novou událost pro změnu světa',
      });
    }

    await this.assertCanWrite(existing.worldId, requester);

    // imageUrl: null v body znamená "zachovat stávající" (per parity).
    // hour: null v body znamená "smazat hodinu" (uloží null do DB).
    const patch: Record<string, unknown> = {
      ...(dto.title !== undefined && { title: dto.title }),
      // F-02 — sanitizace rich-textu i při update (viz create).
      ...(dto.text !== undefined && { text: sanitizeRichText(dto.text) }),
      ...(dto.year !== undefined && { year: dto.year }),
      ...(dto.month !== undefined && { month: dto.month }),
      ...(dto.day !== undefined && { day: dto.day }),
      ...(dto.hour !== undefined && { hour: dto.hour }),
      ...(dto.link !== undefined && { link: dto.link }),
      // 9.3 — focal/pageSlug: undefined = beze změny, null = clear, value = set
      ...(dto.imageFocalX !== undefined && { imageFocalX: dto.imageFocalX }),
      ...(dto.imageFocalY !== undefined && { imageFocalY: dto.imageFocalY }),
      ...(dto.pageSlug !== undefined && { pageSlug: dto.pageSlug }),
      ...(dto.celestialOverrides !== undefined && {
        celestialOverrides: dto.celestialOverrides,
      }),
    };
    if (dto.imageUrl !== undefined) {
      patch.imageUrl = dto.imageUrl === null ? existing.imageUrl : dto.imageUrl;
    }

    const updated = await this.repo.update(id, patch);
    if (!updated)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Událost nenalezena',
      });
    // CD-RUN-1 — výměna obrázku → úklid blobu starého (vzor game-events/world-news).
    if (
      dto.imageUrl !== undefined &&
      dto.imageUrl !== null &&
      existing.imageUrl &&
      existing.imageUrl !== dto.imageUrl
    ) {
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    }
    const config = await this.calendarConfigService.getTimelineConfig(
      updated.worldId,
    );
    return this.enrich(updated, config, true);
  }

  async delete(id: string, requester: TimelineRequester): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Událost nenalezena',
      });
    await this.assertCanWrite(existing.worldId, requester);
    const deleted = await this.repo.delete(id);
    if (!deleted)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Událost nenalezena',
      });
    // CD-RUN-1 — úklid blobu obrázku smazané události (vzor game-events).
    if (existing.imageUrl) {
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    }
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
    if (membership.role < WorldRole.Hrac) {
      // R-06 — rozliš Zadatel (pending, role 0) od Ctenar (role 1, nedostatečná
      // role): Ctenar NENÍ pending, takže `PENDING_MEMBERSHIP` ho mátlo.
      const pending = membership.role === WorldRole.Zadatel;
      throw new ForbiddenException({
        code: pending ? 'PENDING_MEMBERSHIP' : 'INSUFFICIENT_ROLE',
        message: pending
          ? 'Pending členství nemá přístup'
          : 'Časová osa je dostupná od role Hráč.',
      });
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
        code: 'TIMELINE_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    if (membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException({
        code: 'TIMELINE_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
  }
}
