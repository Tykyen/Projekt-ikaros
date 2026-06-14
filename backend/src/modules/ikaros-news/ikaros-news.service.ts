import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { logWarn } from '../../common/logging/log-error.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  FindOptions,
  IIkarosNewsRepository,
  NewsScope,
} from './interfaces/ikaros-news-repository.interface';
import type {
  IkarosNewsItem,
  IkarosNewsResponse,
} from './interfaces/ikaros-news.interface';
import type { CreateIkarosNewsDto } from './dto/create-ikaros-news.dto';
import type { UpdateIkarosNewsDto } from './dto/update-ikaros-news.dto';
import { UserRole } from '../users/interfaces/user.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { PushService } from '../push/push.service';
import type {
  AdminAuditAction,
  IAdminAuditLogRepository,
} from '../admin/interfaces/admin-audit-log.interface';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';

@Injectable()
export class IkarosNewsService {
  private readonly logger = new Logger(IkarosNewsService.name);

  constructor(
    @Inject('IIkarosNewsRepository')
    private readonly repo: IIkarosNewsRepository,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
    private readonly pushService: PushService,
    @Inject('IAdminAuditLogRepository')
    private readonly auditRepo: IAdminAuditLogRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * D-067 — zápis akce nad novinkou do admin audit logu (`targetType:
   * 'ikaros-news'`). Best-effort — selhání auditu nesmí blokovat operaci.
   */
  private async auditNews(
    actorId: string,
    action: AdminAuditAction,
    news: { id: string; title: string },
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      const actor = await this.usersRepo.findById(actorId);
      await this.auditRepo.record({
        actorId,
        actorUsername: actor?.username ?? 'neznámý',
        targetId: news.id,
        targetUsername: news.title,
        targetType: 'ikaros-news',
        action,
        before,
        after,
        reason: null,
      });
    } catch (e) {
      this.logger.warn(`Audit novinky selhal: ${String(e)}`);
    }
  }

  /**
   * D-069 — Ikaros novinky jsou platformový obsah, smí je spravovat jen globální
   * role Admin/Superadmin. PJ je world-scoped, sem nepatří. Případné rozšíření
   * na další globální „obsahové" role přijde s definicí matice ve fázi 3.1.
   */
  private assertCanWrite(role: UserRole): void {
    if (role !== UserRole.Superadmin && role !== UserRole.Admin)
      throw new ForbiddenException({
        code: 'FORBIDDEN_PLATFORM_ROLE',
        message: 'Nedostatečná oprávnění',
      });
  }

  /**
   * D-068 + Spec 3.1 — paginace + scope filter. Default `scope='active'` (BC
   * pro dashboard 2.1, který volá `findAll()` bez argumentu).
   */
  async findAll(opts?: FindOptions): Promise<IkarosNewsResponse[]> {
    const items = await this.repo.findByScope(opts);
    return this.joinAuthorNames(items);
  }

  /**
   * D-068 + Spec 3.1 — count pro paginační meta. Default scope `'active'`.
   * Alias `countActive()` zachovaný pro BC s existujícími callery.
   */
  async count(scope: NewsScope = 'active'): Promise<number> {
    return this.repo.countByScope(scope);
  }

  /** @deprecated Použij `count('active')`. Zachováno pro BC s existujícím controllerem. */
  async countActive(): Promise<number> {
    return this.count('active');
  }

  async create(
    dto: CreateIkarosNewsDto,
    authorId: string,
    role: UserRole,
  ): Promise<IkarosNewsResponse> {
    this.assertCanWrite(role);
    const item = await this.repo.create({
      title: dto.title,
      // F-10 — sanitizace rich-text obsahu před uložením (konzistence s articles/pages/timeline).
      content: sanitizeRichText(dto.content),
      authorId,
      createdAtUtc: new Date(),
      archived: false,
      // Spec 3.1b — default 'info' pokud klient typ nepošle.
      type: dto.type ?? 'info',
      imageUrl: dto.imageUrl,
    });

    void this.pushService
      .notifyAll({
        title: 'Nová novinka na Ikarosu',
        body: item.title.slice(0, 100),
      })
      .catch((err: unknown) =>
        logWarn(this.logger, 'notifyAll selhal pro Ikaros novinku', err),
      );

    this.eventEmitter.emit('ikaros-news.changed', {});

    const [enriched] = await this.joinAuthorNames([item]);
    return enriched;
  }

  /**
   * Spec 3.1 — partial update titulu/obsahu. Alespoň jedno pole povinné,
   * jinak 400. Neexistující id → 404. Authz: Admin/Superadmin.
   */
  async update(
    id: string,
    dto: UpdateIkarosNewsDto,
    role: UserRole,
  ): Promise<IkarosNewsResponse> {
    this.assertCanWrite(role);
    if (
      dto.title === undefined &&
      dto.content === undefined &&
      dto.type === undefined &&
      dto.imageUrl === undefined
    ) {
      throw new BadRequestException({
        code: 'IKAROS_NEWS_EMPTY_UPDATE',
        message: 'Musíš upravit alespoň jedno pole.',
      });
    }
    const updated = await this.repo.update(id, {
      ...(dto.title !== undefined && { title: dto.title }),
      // F-10 — sanitizace rich-text obsahu před uložením.
      ...(dto.content !== undefined && {
        content: sanitizeRichText(dto.content),
      }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
    });
    if (!updated)
      throw new NotFoundException({
        code: 'IKAROS_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });
    this.eventEmitter.emit('ikaros-news.changed', {});
    const [enriched] = await this.joinAuthorNames([updated]);
    return enriched;
  }

  /**
   * Spec 3.1 — archivace (idempotentní). Opakované volání na již-archived
   * položce = no-op (vrátí current state bez chyby). Authz: Admin/Superadmin.
   */
  async archive(
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<IkarosNewsResponse> {
    this.assertCanWrite(role);
    const updated = await this.repo.setArchived(id, true, userId);
    if (!updated)
      throw new NotFoundException({
        code: 'IKAROS_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });
    await this.auditNews(
      userId,
      'IKAROS_NEWS_ARCHIVE',
      updated,
      { archived: false },
      { archived: true },
    );
    this.eventEmitter.emit('ikaros-news.changed', {});
    const [enriched] = await this.joinAuthorNames([updated]);
    return enriched;
  }

  /**
   * Spec 3.1 — obnovení archivované novinky (idempotentní). Authz: Admin/Superadmin.
   */
  async unarchive(
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<IkarosNewsResponse> {
    this.assertCanWrite(role);
    const updated = await this.repo.setArchived(id, false);
    if (!updated)
      throw new NotFoundException({
        code: 'IKAROS_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });
    await this.auditNews(
      userId,
      'IKAROS_NEWS_UNARCHIVE',
      updated,
      { archived: true },
      { archived: false },
    );
    this.eventEmitter.emit('ikaros-news.changed', {});
    const [enriched] = await this.joinAuthorNames([updated]);
    return enriched;
  }

  async delete(id: string, userId: string, role: UserRole): Promise<void> {
    this.assertCanWrite(role);
    // D-067 — novinku načteme před smazáním (title pro audit záznam).
    const existing = await this.repo.findById(id);
    const deleted = await this.repo.delete(id);
    if (!deleted)
      throw new NotFoundException({
        code: 'IKAROS_NEWS_NOT_FOUND',
        message: 'Novinka nenalezena',
      });
    if (existing) {
      await this.auditNews(
        userId,
        'IKAROS_NEWS_DELETE',
        existing,
        { title: existing.title, archived: existing.archived ?? false },
        null,
      );
    }
    this.eventEmitter.emit('ikaros-news.changed', {});
  }

  /**
   * Pro každou novinku doplní `authorName` joinem z Users (1 query / unikátní authorId).
   * Smazaní/neexistující uživatelé fallback na legacy `authorName` z DB.
   */
  private async joinAuthorNames(
    items: IkarosNewsItem[],
  ): Promise<IkarosNewsResponse[]> {
    const uniqueIds = [...new Set(items.map((i) => i.authorId))];
    const usersById = new Map<string, string>();
    await Promise.all(
      uniqueIds.map(async (id) => {
        const user = await this.usersRepo.findById(id);
        if (user) usersById.set(id, user.username);
      }),
    );
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      authorId: item.authorId,
      authorName: usersById.get(item.authorId) ?? item.authorName ?? '',
      createdAtUtc: item.createdAtUtc,
      archived: item.archived ?? false,
      archivedAtUtc: item.archivedAtUtc,
      archivedByUserId: item.archivedByUserId,
      // Spec 3.1b — vždy přítomné, legacy fallback 'info'.
      type: item.type ?? 'info',
      imageUrl: item.imageUrl,
    }));
  }
}
