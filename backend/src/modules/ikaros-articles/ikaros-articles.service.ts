import {
  Injectable,
  Inject,
  Optional,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  forwardRef,
} from '@nestjs/common';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';
import { ArticleVersionsRepository } from './repositories/article-versions.repository';
import type { IIkarosArticlesRepository } from './interfaces/ikaros-articles-repository.interface';
import type { IkarosArticle } from './interfaces/ikaros-article.interface';
import type { ArticleVersion } from './interfaces/article-version.interface';
import type { IArticleReadsRepository } from './interfaces/article-reads-repository.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { User } from '../users/interfaces/user.interface';
import type { CreateArticleDto } from './dto/create-article.dto';
import type { UpdateArticleDto } from './dto/update-article.dto';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { IkarosCategoriesService } from '../ikaros-categories/ikaros-categories.service';

const ADMIN_ROLES = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.PJ,
  UserRole.SpravceClanku,
];
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };

const DEFAULT_CATEGORY = 'ostatni';
// 3.7 — max připnutých článků v sidebaru
const MAX_PINNED = 5;

@Injectable()
export class IkarosArticlesService {
  constructor(
    @Inject('IIkarosArticlesRepository')
    private readonly repo: IIkarosArticlesRepository,
    @Inject('IArticleReadsRepository')
    private readonly readsRepo: IArticleReadsRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    // D-040 — tombstone batch enrich pro `authorIsDeleted` v article responses.
    private readonly usersService: UsersService,
    @Inject('IkarosMessagesService')
    private readonly msgService: IkarosMessagesService,
    @Inject(forwardRef(() => IkarosCategoriesService))
    private readonly categoriesService: IkarosCategoriesService,
    // D-NEW-article-versions — optional, pro starší testy bez DI module nemusí být.
    @Optional()
    private readonly versionsRepo?: ArticleVersionsRepository,
  ) {}

  isAdmin(role: UserRole | undefined, username: string | undefined): boolean {
    if (role === undefined) return false;
    return ADMIN_ROLES.includes(role) || username === 'Tyky';
  }

  private assertAdmin(
    role: UserRole | undefined,
    username: string | undefined,
  ): void {
    if (!this.isAdmin(role, username))
      throw new ForbiddenException({
        code: 'ARTICLE_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
  }

  private async assertCategoryExists(key: string): Promise<void> {
    const exists = await this.categoriesService.existsByKey(key);
    if (!exists) {
      throw new BadRequestException({
        code: 'ARTICLE_INVALID_CATEGORY',
        message: `Kategorie '${key}' neexistuje`,
      });
    }
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    const tyky = await this.usersRepo.findByUsername('Tyky');
    const recipients = [...admins];
    if (tyky && !admins.some((a) => a.id === tyky.id)) recipients.push(tyky);
    await Promise.all(
      recipients.map((r) =>
        this.msgService.create(
          { recipientId: r.id, recipientName: r.username, subject, body },
          SYSTEM_SENDER,
        ),
      ),
    );
  }

  private async notifyUser(
    recipientId: string,
    recipientName: string,
    subject: string,
    body: string,
  ): Promise<void> {
    await this.msgService.create(
      { recipientId, recipientName, subject, body },
      SYSTEM_SENDER,
    );
  }

  /**
   * 3.2a — anon `role === undefined` vidí jen Published. Admin vidí
   * Published + Pending. Ostatní (auth ne-admin) jen Published.
   */
  async findAll(
    role: UserRole | undefined,
    username: string | undefined,
    search?: string,
  ): Promise<IkarosArticle[]> {
    // D-NEW-search-be — server-side fulltext přes $text index na `title`+`content`.
    // Pokud `search` není zadaný, vrátíme jako dřív (FE může pořád filtrovat
    // client-side pro malé sety, ale paging-ready endpoint je tady připraven).
    let articles: IkarosArticle[];
    if (search && search.trim()) {
      const trimmed = search.trim();
      articles = this.isAdmin(role, username)
        ? await this.repo.searchPublishedAndPending(trimmed)
        : await this.repo.searchPublished(trimmed);
    } else {
      articles = this.isAdmin(role, username)
        ? await this.repo.findPublishedAndPending()
        : await this.repo.findPublished();
    }
    return this.enrichTombstoneAuthors(articles);
  }

  /**
   * D-040 — batch enrich `authorIsDeleted` na pole IkarosArticle.
   * 60s cache v UsersService minimalizuje DB lookupy pro hot listy.
   */
  private async enrichTombstoneAuthors(
    articles: IkarosArticle[],
  ): Promise<IkarosArticle[]> {
    if (articles.length === 0) return articles;
    const ids = Array.from(new Set(articles.map((a) => a.authorId)));
    const info = await this.usersService.findManyTombstoneInfo(ids);
    return articles.map((a) => ({
      ...a,
      authorIsDeleted: info.get(a.authorId)?.isDeleted ?? false,
    }));
  }

  /** D-040 — single-article variant. */
  private async enrichTombstoneAuthor(
    article: IkarosArticle,
  ): Promise<IkarosArticle> {
    const info = await this.usersService.findManyTombstoneInfo([
      article.authorId,
    ]);
    return {
      ...article,
      authorIsDeleted: info.get(article.authorId)?.isDeleted ?? false,
    };
  }

  async findMy(authorId: string): Promise<IkarosArticle[]> {
    const articles = await this.repo.findByAuthor(authorId);
    return this.enrichTombstoneAuthors(articles);
  }

  async findPending(
    role: UserRole,
    username: string,
  ): Promise<IkarosArticle[]> {
    this.assertAdmin(role, username);
    const articles = await this.repo.findPending();
    return this.enrichTombstoneAuthors(articles);
  }

  async findStats(authorId: string): Promise<{
    draft: number;
    pending: number;
    published: number;
    rejected: number;
    totalRatings: number;
    averageRating: number;
  }> {
    const [counts, articles] = await Promise.all([
      this.repo.countByAuthorAndStatus(authorId),
      this.repo.findByAuthor(authorId),
    ]);
    const published = articles.filter((a) => a.status === 'Published');
    const totalRatings = published.reduce((s, a) => s + a.ratings.length, 0);
    const avgSum = published.reduce(
      (s, a) => s + a.averageRating * a.ratings.length,
      0,
    );
    const averageRating =
      totalRatings > 0 ? Math.round((avgSum / totalRatings) * 10) / 10 : 0;
    return {
      draft: counts.Draft,
      pending: counts.Pending,
      published: counts.Published,
      rejected: counts.Rejected,
      totalRatings,
      averageRating,
    };
  }

  /**
   * 3.2a — anon (`userId === undefined`) vidí jen Published, non-Published → 403.
   */
  async findById(
    id: string,
    userId: string | undefined,
    role: UserRole | undefined,
    username: string | undefined,
  ): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    // Anon — jen Published
    if (!userId) {
      if (article.status !== 'Published') {
        throw new ForbiddenException({
          code: 'ARTICLE_ACCESS_DENIED',
          message: 'Přístup odepřen',
        });
      }
      return this.enrichTombstoneAuthor(article);
    }
    // Auth — vlastník + admin + Published
    if (
      article.status !== 'Published' &&
      article.authorId !== userId &&
      !this.isAdmin(role, username)
    ) {
      throw new ForbiddenException({
        code: 'ARTICLE_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    return this.enrichTombstoneAuthor(article);
  }

  async create(
    dto: CreateArticleDto,
    authorId: string,
    authorName: string,
    _role: UserRole,
  ): Promise<IkarosArticle> {
    const category = dto.category ?? DEFAULT_CATEGORY;
    await this.assertCategoryExists(category);
    const status = dto.submit ? 'Pending' : 'Draft';
    // D-NEW-html-sanitization (2026-05-21) — sanitize TipTap output před uložením.
    const safeContent = sanitizeRichText(dto.content);
    const article = await this.repo.create({
      title: dto.title,
      content: safeContent,
      category,
      authorId,
      authorName,
      status,
      ratings: [],
      averageRating: 0,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    if (status === 'Pending') {
      await this.notifyAdmins(
        'Článek čeká na schválení',
        `/ikaros/clanky/${article.id}`,
      );
    }
    return article;
  }

  async update(
    id: string,
    dto: UpdateArticleDto,
    userId: string,
    _role: UserRole,
    _username: string,
  ): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (article.authorId !== userId)
      throw new ForbiddenException({
        code: 'ARTICLE_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    if (article.status !== 'Draft' && article.status !== 'Rejected') {
      throw new BadRequestException(
        'Editovat lze jen Draft nebo Rejected článek',
      );
    }
    if (dto.category) {
      await this.assertCategoryExists(dto.category);
    }
    // D-NEW-html-sanitization (2026-05-21) — sanitize obsahu pokud je v patch.
    const patch =
      dto.content !== undefined
        ? { ...dto, content: sanitizeRichText(dto.content) }
        : dto;

    // D-NEW-article-versions — snapshot PŘED update (uchovává předchozí stav).
    if (this.versionsRepo) {
      const revision = await this.versionsRepo.getNextRevision(id);
      await this.versionsRepo.create({
        articleId: id,
        revision,
        title: article.title,
        content: article.content,
        category: article.category,
        status: article.status,
        editedBy: userId,
        editedByName: article.authorName,
      });
    }

    const updated = await this.repo.update(id, {
      ...patch,
      updatedAtUtc: new Date(),
    });
    return updated!;
  }

  /** D-NEW-article-versions — list revizí. Autor vidí svoje, admin všechny. */
  async getVersions(
    articleId: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<ArticleVersion[]> {
    const article = await this.repo.findById(articleId);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (article.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException({
        code: 'ARTICLE_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    return this.versionsRepo?.findByArticleId(articleId) ?? [];
  }

  async delete(
    id: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<void> {
    const article = await this.repo.findById(id);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (article.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException({
        code: 'ARTICLE_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    await this.repo.delete(id);
    // D-NEW-article-versions — cleanup snapshotů.
    await this.versionsRepo?.deleteByArticleId(id);
  }

  async submit(
    id: string,
    userId: string,
    _role: UserRole,
  ): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (article.authorId !== userId)
      throw new ForbiddenException({
        code: 'ARTICLE_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    if (article.status !== 'Draft' && article.status !== 'Rejected') {
      throw new BadRequestException(
        'Odeslat lze jen Draft nebo Rejected článek',
      );
    }
    const updated = await this.repo.update(id, {
      status: 'Pending',
      updatedAtUtc: new Date(),
    });
    await this.notifyAdmins('Článek čeká na schválení', `/ikaros/clanky/${id}`);
    return updated!;
  }

  async approve(
    id: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosArticle> {
    this.assertAdmin(role, username);
    const article = await this.repo.findById(id);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (article.status !== 'Pending')
      throw new BadRequestException({
        code: 'ARTICLE_NOT_PENDING',
        message: 'Schválit lze jen Pending článek',
      });
    const updated = await this.repo.update(id, {
      status: 'Published',
      publishedAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    await this.notifyUser(
      article.authorId,
      article.authorName,
      'Článek schválen',
      `Tvůj článek "${article.title}" byl schválen.`,
    );
    return updated!;
  }

  async reject(
    id: string,
    reason: string | undefined,
    role: UserRole,
    username: string,
  ): Promise<IkarosArticle> {
    this.assertAdmin(role, username);
    const article = await this.repo.findById(id);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (article.status !== 'Pending')
      throw new BadRequestException({
        code: 'ARTICLE_NOT_PENDING',
        message: 'Zamítnout lze jen Pending článek',
      });
    const updated = await this.repo.update(id, {
      status: 'Rejected',
      rejectReason: reason,
      updatedAtUtc: new Date(),
    });
    const body = reason
      ? `Důvod zamítnutí: ${reason}`
      : `Tvůj článek "${article.title}" byl zamítnut.`;
    await this.notifyUser(
      article.authorId,
      article.authorName,
      'Článek zamítnut',
      body,
    );
    return updated!;
  }

  /**
   * D-NEW-bulk-pending-articles (2026-05-21) — Bulk approve/reject pro
   * SpravciClanku. Aplikuje approve/reject na pole article IDs; vrací summary
   * `{succeeded, failed}` (per-ID partial failures). Notifikace jdou jednotlivě.
   */
  async bulkApprove(
    ids: string[],
    role: UserRole,
    username: string,
  ): Promise<{
    succeeded: string[];
    failed: { id: string; reason: string }[];
  }> {
    this.assertAdmin(role, username);
    const succeeded: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.approve(id, role, username);
        succeeded.push(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Neznámá chyba';
        failed.push({ id, reason: msg });
      }
    }
    return { succeeded, failed };
  }

  async bulkReject(
    ids: string[],
    reason: string | undefined,
    role: UserRole,
    username: string,
  ): Promise<{
    succeeded: string[];
    failed: { id: string; reason: string }[];
  }> {
    this.assertAdmin(role, username);
    const succeeded: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.reject(id, reason, role, username);
        succeeded.push(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Neznámá chyba';
        failed.push({ id, reason: msg });
      }
    }
    return { succeeded, failed };
  }

  async rate(
    id: string,
    stars: number,
    userId: string,
    _role: UserRole,
    userName = '',
    text = '',
  ): Promise<{ averageRating: number; totalRatings: number }> {
    const article = await this.repo.findById(id);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (article.status !== 'Published')
      throw new BadRequestException({
        code: 'ARTICLE_NOT_PUBLISHED',
        message: 'Hodnotit lze jen Published článek',
      });
    if (article.authorId === userId)
      throw new ForbiddenException({
        code: 'ARTICLE_SELF_RATING',
        message: 'Autor nemůže hodnotit vlastní článek',
      });
    const updated = await this.repo.upsertRating(id, {
      userId,
      stars,
      userName,
      text: text.trim(),
      createdAtUtc: new Date(),
    });
    return {
      averageRating: updated?.averageRating ?? 0,
      totalRatings: updated?.ratings.length ?? 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3.2a — mark-as-read tracking
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Idempotentně označit článek jako přečtený daným uživatelem. Spouští FE
   * IntersectionObserver po 50 % + 30 s na stránce. Funguje jen na Published
   * (jinak BadRequest — neměl by se anketovat ani na Pending/Draft).
   */
  async markRead(articleId: string, userId: string): Promise<void> {
    const article = await this.repo.findById(articleId);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (article.status !== 'Published') {
      throw new BadRequestException({
        code: 'ARTICLE_NOT_PUBLISHED',
        message: 'Lze označit jen publikovaný článek',
      });
    }
    await this.readsRepo.upsertRead(userId, articleId);
  }

  async isReadByUser(articleId: string, userId: string): Promise<boolean> {
    return this.readsRepo.isRead(userId, articleId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3.7 — oblíbené (záložky) + připnutí do sidebaru
  // ─────────────────────────────────────────────────────────────────────────

  async findMyFavorites(userId: string): Promise<IkarosArticle[]> {
    const user = await this.usersRepo.findById(userId);
    if (!user) return [];
    const ids = user.favoriteArticleIds ?? [];
    if (ids.length === 0) return [];
    const articles = await this.repo.findByIds(ids);
    return this.enrichTombstoneAuthors(articles);
  }

  async toggleFavorite(
    articleId: string,
    userId: string,
  ): Promise<{ isFavorite: boolean }> {
    const user = await this.usersRepo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    const article = await this.repo.findById(articleId);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    const favorites = user.favoriteArticleIds ?? [];
    const isFavorite = favorites.includes(articleId);
    const newFavorites = isFavorite
      ? favorites.filter((id) => id !== articleId)
      : [...favorites, articleId];
    const update: Partial<User> = { favoriteArticleIds: newFavorites };
    // cascade — odebrání z oblíbených zároveň odepne ze sidebaru
    if (isFavorite) {
      const pinned = user.pinnedArticleIds ?? [];
      if (pinned.includes(articleId))
        update.pinnedArticleIds = pinned.filter((id) => id !== articleId);
    }
    await this.usersRepo.update(userId, update);
    return { isFavorite: !isFavorite };
  }

  async togglePin(
    articleId: string,
    userId: string,
  ): Promise<{ isPinned: boolean }> {
    const user = await this.usersRepo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    const article = await this.repo.findById(articleId);
    if (!article)
      throw new NotFoundException({
        code: 'ARTICLE_NOT_FOUND',
        message: 'Článek nenalezen',
      });
    if (!(user.favoriteArticleIds ?? []).includes(articleId))
      throw new ConflictException({
        code: 'NOT_FAVORITE',
        message: 'Připnout lze jen oblíbený článek',
      });
    const pinned = user.pinnedArticleIds ?? [];
    const isPinned = pinned.includes(articleId);
    if (!isPinned && pinned.length >= MAX_PINNED)
      throw new ConflictException({
        code: 'PIN_LIMIT',
        message: `Připnout lze max ${MAX_PINNED} článků`,
      });
    const newPinned = isPinned
      ? pinned.filter((id) => id !== articleId)
      : [...pinned, articleId];
    await this.usersRepo.update(userId, { pinnedArticleIds: newPinned });
    return { isPinned: !isPinned };
  }

  /**
   * Počet Published článků, které uživatel ještě nečetl. Effiicient přes
   * `findPublishedIds` + `countReadByUserForArticleIds`.
   */
  async unreadCountForUser(userId: string): Promise<number> {
    const publishedIds = await this.repo.findPublishedIds();
    if (publishedIds.length === 0) return 0;
    const readCount = await this.readsRepo.countReadByUserForArticleIds(
      userId,
      publishedIds,
    );
    return publishedIds.length - readCount;
  }
}
