import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { CreateGameEventDto } from './dto/create-game-event.dto';
import type { UpdateGameEventDto } from './dto/update-game-event.dto';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';
import type { ReactCommentDto } from './dto/react-comment.dto';
import type { UpcomingEventDto } from './dto/upcoming-event.dto';
import { randomUUID } from 'node:crypto';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { GameEvent } from './interfaces/game-event.interface';
import type { RequestUser } from '../worlds/worlds.service';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import {
  WorldRole,
  type WorldMembership,
} from '../worlds/interfaces/world-membership.interface';
import { PushService } from '../push/push.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ACTIVE_WINDOW_MS } from '../../common/constants/time.constants';

/**
 * Tolerance pro detekci „žádosti o archiv" ve `findList`. FE posílá `fromDate`
 * = cutoff zaokrouhlený DOLŮ na minutu (+ síťová latence), takže je vždy
 * nepatrně < BE cutoff. Bez tolerance by legitimní „upcoming" hráče spadlo do
 * archivu → 403 a hráč by neviděl žádné akce. 5 min bezpečně pokryje rounding
 * + latenci; reálná žádost o archiv (fromDate hodiny/dny zpět) se pořád zachytí.
 */
const ARCHIVE_SKEW_MS = 5 * 60 * 1000;

@Injectable()
export class GameEventsService {
  private readonly logger = new Logger(GameEventsService.name);

  constructor(
    @Inject('IGameEventRepository') private readonly repo: IGameEventRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    private readonly pushService: PushService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Permission helpers ───────────────────────────────────────────────────

  private async getMembership(
    userId: string,
    worldId: string,
  ): Promise<WorldMembership | null> {
    return this.membershipRepo.findByUserAndWorld(userId, worldId);
  }

  /** Kdo smí mutovat event (POST/PUT/DELETE) — Admin/Superadmin globálně, jinak PJ/PomocnýPJ světa */
  private async canManage(
    user: RequestUser,
    worldId: string,
  ): Promise<boolean> {
    if (worldAdminBypass(user, worldId)) return true;
    const m = await this.getMembership(user.id, worldId);
    if (!m) return false;
    return m.role >= WorldRole.PomocnyPJ;
  }

  /** Kdo vidí event (GET, comment, RSVP) — respektuje groupOnly */
  private async canView(user: RequestUser, event: GameEvent): Promise<boolean> {
    if (worldAdminBypass(user, event.worldId)) return true;
    const m = await this.getMembership(user.id, event.worldId);
    if (!m || m.role === WorldRole.Zadatel) return false;
    if (!event.groupOnly) return true;
    if (m.role >= WorldRole.PomocnyPJ) return true;
    return event.targetGroup !== null && m.group === event.targetGroup;
  }

  private async assertManage(
    user: RequestUser,
    worldId: string,
  ): Promise<void> {
    if (!(await this.canManage(user, worldId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
  }

  private async assertViewOrThrow(
    user: RequestUser,
    event: GameEvent,
  ): Promise<void> {
    if (!(await this.canView(user, event))) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    }
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findById(id: string, user: RequestUser): Promise<GameEvent> {
    const event = await this.repo.findById(id);
    if (!event)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    await this.assertViewOrThrow(user, event);
    return event;
  }

  async findList(
    filters: {
      worldId: string;
      limit?: number;
      fromDate?: string;
      toDate?: string;
    },
    user: RequestUser,
  ): Promise<GameEvent[]> {
    const cappedLimit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 500) : 100;

    // 9.1-I — archive role gate. Hráč nesmí žádat o archiv (date < cutoff).
    // Auto-clamp: hráč bez fromDate dostane silent fromDate=cutoff (default = jen nadcházející).
    let effectiveFilters = { ...filters };
    let membership: WorldMembership | null = null;
    if (!worldAdminBypass(user, filters.worldId)) {
      membership = await this.getMembership(user.id, filters.worldId);
      if (!membership || membership.role === WorldRole.Zadatel) return [];

      const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
      // `fromDate` se posuzuje s tolerancí (ARCHIVE_SKEW_MS) — viz konstanta:
      // FE cutoff je zaokrouhlený dolů na minutu, jinak by upcoming hráče
      // spadlo do archivu a vrátilo 403.
      const archiveThresholdMs =
        Date.now() - ACTIVE_WINDOW_MS - ARCHIVE_SKEW_MS;
      const requestsArchive =
        filters.toDate !== undefined ||
        (filters.fromDate !== undefined &&
          new Date(filters.fromDate).getTime() < archiveThresholdMs);

      if (requestsArchive && membership.role < WorldRole.PomocnyPJ) {
        throw new ForbiddenException({
          code: 'ARCHIVE_PJ_ONLY',
          message: 'Archiv akcí vidí pouze PJ a Pomocný PJ.',
        });
      }

      if (
        membership.role < WorldRole.PomocnyPJ &&
        effectiveFilters.fromDate === undefined
      ) {
        effectiveFilters = { ...effectiveFilters, fromDate: cutoff };
      }
    }

    const events = await this.repo.findList({
      worldId: effectiveFilters.worldId,
      limit: cappedLimit,
      fromDate: effectiveFilters.fromDate,
      toDate: effectiveFilters.toDate,
    });

    if (!membership) return events; // global admin/superadmin

    const m = membership;
    return events.filter((e) => {
      if (!e.groupOnly) return true;
      if (m.role >= WorldRole.PomocnyPJ) return true;
      return e.targetGroup !== null && m.group === e.targetGroup;
    });
  }

  async findUpcomingForUser(
    user: RequestUser,
    limit: number,
  ): Promise<UpcomingEventDto[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const memberships = await this.membershipRepo.findByUserId(user.id);
    const visibleMemberships = memberships.filter(
      (m) => m.role !== WorldRole.Zadatel,
    );
    if (visibleMemberships.length === 0) return [];

    const worldIds = visibleMemberships.map((m) => m.worldId);
    const fetchCap = Math.min(safeLimit * 5, 100);
    const rawEvents = await this.repo.findUpcomingForWorlds(
      worldIds,
      new Date().toISOString(),
      fetchCap,
    );

    const membershipByWorld = new Map(
      visibleMemberships.map((m) => [m.worldId, m]),
    );
    const filtered = rawEvents.filter((e) => {
      const m = membershipByWorld.get(e.worldId);
      if (!m) return false;
      if (!e.groupOnly) return true;
      if (m.role >= WorldRole.PomocnyPJ) return true;
      return e.targetGroup !== null && m.group === e.targetGroup;
    });

    const worlds = await this.worldsRepo.findByIds(worldIds);
    const worldMap = new Map(worlds.map((w) => [w.id, w]));

    return filtered.slice(0, safeLimit).map((e) => {
      const world = worldMap.get(e.worldId);
      return {
        id: e.id,
        worldId: e.worldId,
        worldName: world?.name ?? '',
        worldSlug: world?.slug ?? '',
        title: e.title,
        date: e.date,
        confirmable: e.confirmable,
        myRsvp: e.confirmedBy.some((c) => c.userId === user.id)
          ? 'confirmed'
          : 'none',
        confirmedCount: e.confirmedBy.length,
      };
    });
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async create(dto: CreateGameEventDto, user: RequestUser): Promise<GameEvent> {
    await this.assertManage(user, dto.worldId);
    if (
      dto.groupOnly === true &&
      (dto.targetGroup === null || dto.targetGroup === undefined)
    ) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'groupOnly vyžaduje targetGroup',
      });
    }

    const event = await this.repo.create({
      worldId: dto.worldId,
      title: dto.title,
      date: dto.date,
      description: dto.description ?? '',
      imageUrl: dto.imageUrl ?? null,
      imageFocalX: dto.imageFocalX ?? null,
      imageFocalY: dto.imageFocalY ?? null,
      imageZoom: dto.imageZoom ?? null,
      imageFit: dto.imageFit ?? null,
      targetGroup: dto.targetGroup ?? null,
      groupOnly: dto.groupOnly ?? false,
      // FIX-61 — mirror `ikaros-events.service.ts` + schema default `true`.
      confirmable: dto.confirmable ?? true,
      confirmedBy: [],
      comments: [],
      reminderSent: false,
      reminder1hSent: false,
    });

    void this.notifyOnCreate(event).catch((err) => {
      this.logger.warn(
        `Push notify failed for event ${event.id}: ${(err as Error).message}`,
      );
    });

    return event;
  }

  async update(
    id: string,
    dto: UpdateGameEventDto,
    user: RequestUser,
  ): Promise<GameEvent> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    await this.assertManage(user, existing.worldId);

    const finalGroupOnly = dto.groupOnly ?? existing.groupOnly;
    const finalTargetGroup =
      dto.targetGroup !== undefined ? dto.targetGroup : existing.targetGroup;
    // FIX-60 — i na '' (ne jen null/undefined): bez toho šlo PATCHem uložit
    // `groupOnly:true, targetGroup:''` (event bez publika — nikdo ho neuvidí).
    if (
      finalGroupOnly === true &&
      (finalTargetGroup === null ||
        finalTargetGroup === undefined ||
        finalTargetGroup === '')
    ) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'groupOnly vyžaduje targetGroup',
      });
    }

    const patch: Partial<GameEvent> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.date !== undefined) patch.date = dto.date;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.imageUrl !== undefined) patch.imageUrl = dto.imageUrl;
    if (dto.imageFocalX !== undefined) patch.imageFocalX = dto.imageFocalX;
    if (dto.imageFocalY !== undefined) patch.imageFocalY = dto.imageFocalY;
    if (dto.imageZoom !== undefined) patch.imageZoom = dto.imageZoom;
    if (dto.imageFit !== undefined) patch.imageFit = dto.imageFit;
    if (dto.targetGroup !== undefined) patch.targetGroup = dto.targetGroup;
    if (dto.groupOnly !== undefined) patch.groupOnly = dto.groupOnly;
    if (dto.confirmable !== undefined) patch.confirmable = dto.confirmable;
    if (Array.isArray(dto.confirmedBy)) patch.confirmedBy = dto.confirmedBy;

    const updated = await this.repo.update(id, patch);
    if (!updated)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    // UM-03 — úklid starého blobu při výměně obrázku akce.
    if (
      dto.imageUrl !== undefined &&
      existing.imageUrl &&
      existing.imageUrl !== dto.imageUrl
    ) {
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    }
    return updated;
  }

  async delete(id: string, user: RequestUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    await this.assertManage(user, existing.worldId);
    await this.repo.delete(id);
    // UM-03 — úklid blobu obrázku smazané akce.
    if (existing.imageUrl) {
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    }
  }

  async confirm(eventId: string, user: RequestUser): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    await this.assertViewOrThrow(user, event);
    if (!event.confirmable) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Tato akce nepodporuje potvrzení účasti',
      });
    }

    const idx = event.confirmedBy.findIndex((c) => c.userId === user.id);
    const next =
      idx >= 0
        ? event.confirmedBy.filter((_, i) => i !== idx)
        : [...event.confirmedBy, { userId: user.id, userName: user.username }];

    const updated = await this.repo.update(eventId, { confirmedBy: next });
    if (!updated)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    return updated;
  }

  async addComment(
    eventId: string,
    dto: CreateCommentDto,
    user: RequestUser,
  ): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    await this.assertViewOrThrow(user, event);

    if (dto.parentId) {
      const parent = event.comments.find((c) => c.id === dto.parentId);
      if (!parent)
        throw new BadRequestException({
          code: 'BAD_REQUEST',
          message: 'parentId neexistuje v tomto eventu',
        });
      if (parent.parentId !== null)
        throw new BadRequestException(
          'parentId musí ukazovat na root komentář',
        );
    }

    const newComment = {
      id: randomUUID(),
      parentId: dto.parentId ?? null,
      authorId: user.id,
      authorName: user.username,
      content: dto.content,
      createdAt: new Date(),
      editedAt: null,
      reactions: {},
      isDeleted: false,
    };

    const updated = await this.repo.update(eventId, {
      comments: [...event.comments, newComment],
    });
    if (!updated)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    return updated;
  }

  async editComment(
    eventId: string,
    commentId: string,
    dto: UpdateCommentDto,
    user: RequestUser,
  ): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    await this.assertViewOrThrow(user, event);

    const idx = event.comments.findIndex((c) => c.id === commentId);
    if (idx < 0)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Komentář nenalezen',
      });
    const target = event.comments[idx];
    if (target.isDeleted)
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Smazaný komentář nelze editovat',
      });
    if (target.authorId !== user.id)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Nelze editovat cizí komentář',
      });

    const newComments = event.comments.slice();
    newComments[idx] = {
      ...target,
      content: dto.content,
      editedAt: new Date(),
    };

    const updated = await this.repo.update(eventId, { comments: newComments });
    if (!updated)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    return updated;
  }

  async deleteComment(
    eventId: string,
    commentId: string,
    user: RequestUser,
  ): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    await this.assertViewOrThrow(user, event);

    const idx = event.comments.findIndex((c) => c.id === commentId);
    if (idx < 0)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Komentář nenalezen',
      });
    const target = event.comments[idx];

    const isOwner = target.authorId === user.id;
    const canMod = await this.canManage(user, event.worldId);
    if (!isOwner && !canMod)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Nelze smazat cizí komentář',
      });

    const newComments = event.comments.slice();
    newComments[idx] = { ...target, isDeleted: true, content: '' };

    const updated = await this.repo.update(eventId, { comments: newComments });
    if (!updated)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    return updated;
  }

  async reactToComment(
    eventId: string,
    commentId: string,
    dto: ReactCommentDto,
    user: RequestUser,
  ): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    await this.assertViewOrThrow(user, event);

    const idx = event.comments.findIndex((c) => c.id === commentId);
    if (idx < 0)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Komentář nenalezen',
      });
    const target = event.comments[idx];

    // Reakce na smazaný komentář se tiše ignoruje
    if (target.isDeleted) return event;

    const reactions: Record<string, string[]> = { ...target.reactions };
    const userIds = reactions[dto.emoji] ?? [];
    const userIdx = userIds.indexOf(user.id);
    if (userIdx >= 0) {
      const next = userIds.filter((_, i) => i !== userIdx);
      if (next.length === 0) delete reactions[dto.emoji];
      else reactions[dto.emoji] = next;
    } else {
      reactions[dto.emoji] = [...userIds, user.id];
    }

    const newComments = event.comments.slice();
    newComments[idx] = { ...target, reactions };

    const updated = await this.repo.update(eventId, { comments: newComments });
    if (!updated)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event nenalezen',
      });
    return updated;
  }

  private async notifyOnCreate(event: GameEvent): Promise<void> {
    const world = await this.worldsRepo.findById(event.worldId);
    const worldName = world?.name ?? 'svět';

    const members = await this.membershipRepo.findByWorldId(event.worldId);
    const eligible = members.filter((m) => m.role !== WorldRole.Zadatel);

    const recipients = event.groupOnly
      ? eligible.filter(
          (m) =>
            m.role >= WorldRole.PomocnyPJ ||
            (event.targetGroup !== null && m.group === event.targetGroup),
        )
      : eligible;

    const userIds = recipients.map((m) => m.userId);
    if (userIds.length === 0) return;

    await this.pushService.notifyUsers(
      userIds,
      {
        title: `Nový event ve světě ${worldName}`,
        body: event.title,
      },
      'worldEvent',
    );
  }
}
