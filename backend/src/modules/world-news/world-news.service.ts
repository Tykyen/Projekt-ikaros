import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IWorldNewsRepository } from './interfaces/world-news-repository.interface';
import type {
  WorldNewsItem,
  WorldNewsScope,
} from './interfaces/world-news.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import type { CreateWorldNewsDto } from './dto/create-world-news.dto';
import type { UpdateWorldNewsDto } from './dto/update-world-news.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface FindManyArgs {
  worldId?: string;
  limit?: number;
  scope?: WorldNewsScope;
  offset?: number;
  /** Přihlášený uživatel — povinný pro scope 'archived' / 'all'. */
  requester?: WorldNewsRequester;
}

interface CountArgs {
  worldId?: string;
  scope?: WorldNewsScope;
  requester?: WorldNewsRequester;
}

export interface WorldNewsRequester {
  id: string;
  role: UserRole;
  username: string;
  /** Pro world elevation (admin bypass jen v elevovaném světě) — viz worldAdminBypass. */
  elevatedWorldIds?: string[];
}

@Injectable()
export class WorldNewsService {
  constructor(
    @Inject('IWorldNewsRepository')
    private readonly repo: IWorldNewsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findMany(args: FindManyArgs): Promise<WorldNewsItem[]> {
    const scope = args.scope ?? 'active';
    await this.assertCanReadScope(scope, args.worldId, args.requester);
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    return this.repo.findMany({
      worldId: args.worldId,
      limit,
      scope,
      offset: Math.max(0, args.offset ?? 0),
    });
  }

  async count(args: CountArgs): Promise<number> {
    const scope = args.scope ?? 'active';
    await this.assertCanReadScope(scope, args.worldId, args.requester);
    return this.repo.count({ worldId: args.worldId, scope });
  }

  async findById(id: string): Promise<WorldNewsItem> {
    const item = await this.repo.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'WORLD_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });
    return item;
  }

  async create(
    dto: CreateWorldNewsDto,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    const worldId = dto.worldId ?? null;
    await this.assertCanWrite(worldId, requester);

    const created = await this.repo.create({
      worldId,
      title: dto.title,
      content: dto.content,
      date: dto.date ?? new Date().toISOString(),
      type: dto.type ?? 'info',
      link: dto.link,
      // 9.5 — nová pole.
      linkPageSlug: dto.linkPageSlug ?? null,
      imageUrl: dto.imageUrl ?? null,
      imageFocalX: dto.imageFocalX ?? null,
      imageFocalY: dto.imageFocalY ?? null,
      imageZoom: dto.imageZoom ?? null,
      imageFit: dto.imageFit ?? null,
      // 9.2e — fantasy datum (nullable).
      calendarConfigId: dto.calendarConfigId ?? null,
      calendarDate: dto.calendarDate ?? null,
      createdBy: requester.id,
      archived: false,
    });
    this.eventEmitter.emit('world-news.changed', {
      worldId: created.worldId,
    });
    return created;
  }

  async update(
    id: string,
    dto: UpdateWorldNewsDto,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'WORLD_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });

    // Immutable worldId — pokud klient pošle (i identicky), 400.
    // class-validator ten field nepouští dál; tahle kontrola je defense-in-depth
    // pro případ že DTO whitelist selže.
    if ('worldId' in (dto as Record<string, unknown>)) {
      throw new BadRequestException({
        code: 'WORLD_NEWS_WORLD_ID_IMMUTABLE',
        message:
          'worldId je immutable — smaž a vytvoř novou novinku pro změnu scope',
      });
    }

    await this.assertCanWrite(existing.worldId, requester);

    const updated = await this.repo.update(id, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.content !== undefined && { content: dto.content }),
      ...(dto.date !== undefined && { date: dto.date }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.link !== undefined && { link: dto.link ?? undefined }),
      // 9.5 — nová pole; null = explicit clear.
      ...(dto.linkPageSlug !== undefined && {
        linkPageSlug: dto.linkPageSlug,
      }),
      ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
      ...(dto.imageFocalX !== undefined && { imageFocalX: dto.imageFocalX }),
      ...(dto.imageFocalY !== undefined && { imageFocalY: dto.imageFocalY }),
      ...(dto.imageZoom !== undefined && { imageZoom: dto.imageZoom }),
      ...(dto.imageFit !== undefined && { imageFit: dto.imageFit }),
      // 9.2e — fantasy datum (null = reset na real-world display).
      ...(dto.calendarConfigId !== undefined && {
        calendarConfigId: dto.calendarConfigId,
      }),
      ...(dto.calendarDate !== undefined && {
        calendarDate: dto.calendarDate,
      }),
    });
    if (!updated)
      throw new NotFoundException({
        code: 'WORLD_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });
    // UM-03 — úklid starého blobu při výměně obrázku novinky.
    if (
      dto.imageUrl !== undefined &&
      existing.imageUrl &&
      existing.imageUrl !== dto.imageUrl
    ) {
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    }
    this.eventEmitter.emit('world-news.changed', {
      worldId: updated.worldId,
    });
    return updated;
  }

  async delete(id: string, requester: WorldNewsRequester): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'WORLD_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });

    await this.assertCanWrite(existing.worldId, requester);

    const deleted = await this.repo.delete(id);
    if (!deleted)
      throw new NotFoundException({
        code: 'WORLD_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });
    // UM-03 — úklid blobu obrázku smazané novinky.
    if (existing.imageUrl) {
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    }
    this.eventEmitter.emit('world-news.changed', {
      worldId: existing.worldId,
    });
  }

  /** 5.5b — archivace / obnova. Idempotentní; oprávnění = jako write. */
  async archive(
    id: string,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    return this.setArchived(id, true, requester);
  }

  async unarchive(
    id: string,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    return this.setArchived(id, false, requester);
  }

  private async setArchived(
    id: string,
    archived: boolean,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'WORLD_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });

    await this.assertCanWrite(existing.worldId, requester);

    const updated = await this.repo.setArchived(id, archived, requester.id);
    if (!updated)
      throw new NotFoundException({
        code: 'WORLD_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });
    this.eventEmitter.emit('world-news.changed', {
      worldId: updated.worldId,
    });
    return updated;
  }

  /**
   * 5.5b — čtení archivu. `scope=active` je veřejné. `archived` / `all`
   * vyžaduje stejná oprávnění jako správa novinek (PomocnyPJ+ světa / Admin+).
   */
  private async assertCanReadScope(
    scope: WorldNewsScope,
    worldId: string | undefined,
    requester: WorldNewsRequester | undefined,
  ): Promise<void> {
    if (scope === 'active') return;
    if (!requester)
      throw new UnauthorizedException({
        code: 'WORLD_NEWS_AUTH_REQUIRED',
        message: 'Pro archiv je potřeba přihlášení',
      });
    await this.assertCanWrite(worldId ?? null, requester);
  }

  /**
   * Auth pravidla:
   * - Admin/Superadmin smí vždy (role 1 nebo 2; nižší = vyšší)
   * - worldId === null → jen Admin/Superadmin
   * - worldId !== null → Admin/Superadmin NEBO WorldRole >= PomocnyPJ
   * - Anti-leak: neexistující svět = 403 (ne 404), aby anonymní spoofing
   *   neodhalil existenci
   */
  private async assertCanWrite(
    worldId: string | null,
    requester: WorldNewsRequester,
  ): Promise<void> {
    if (worldId === null) {
      // elevation-exempt: globální novinky (worldId=null), není world-scoped.
      // UserRole.Superadmin = 1, UserRole.Admin = 2 (menší číslo = vyšší role)
      if (requester.role <= UserRole.Admin) return;
      throw new ForbiddenException({
        code: 'NOT_PLATFORM_ADMIN',
        message: 'Pouze Admin/Superadmin smí měnit globální novinky',
      });
    }

    // World-scoped: platform admin bypass JEN při aktivní elevaci daného světa.
    if (worldAdminBypass(requester, worldId)) return;

    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new ForbiddenException({
        code: 'NOT_WORLD_HELPER_PJ',
        message: 'Nedostatečná oprávnění',
      });

    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership)
      throw new ForbiddenException({
        code: 'NOT_WORLD_HELPER_PJ',
        message: 'Nedostatečná oprávnění',
      });
    if (membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException({
        code: 'NOT_WORLD_HELPER_PJ',
        message: 'Nedostatečná oprávnění',
      });
    }
  }
}
