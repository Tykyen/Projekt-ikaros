import { Injectable, Inject } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import type { IIkarosArticlesRepository } from './interfaces/ikaros-articles-repository.interface';
import type { ArticleReviewListItem } from './interfaces/article-review-list-item.interface';

const REVIEWER_ROLES: UserRole[] = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceClanku,
];

/**
 * Spec 3.2a — provider pro Zpracovat tab (1.4 architektura). Registrován
 * v `IkarosArticlesModule.onModuleInit()`. SpravceClanku/Admin/Superadmin
 * vidí pending články jako frontu položek; každá karta má 2 akce (Schválit,
 * Vrátit s poznámkou — viz 3.2d renderer).
 */
@Injectable()
export class ArticleReviewProvider implements IPendingActionProvider<ArticleReviewListItem> {
  readonly type = PendingActionType.ArticlePendingReview;

  constructor(
    @Inject('IIkarosArticlesRepository')
    private readonly repo: IIkarosArticlesRepository,
  ) {}

  canHandle(_userId: string, role: UserRole): boolean {
    return REVIEWER_ROLES.includes(role);
  }

  async countForUser(_userId: string, role: UserRole): Promise<number> {
    if (!this.canHandle(_userId, role)) return 0;
    return this.repo.countByStatus('Pending');
  }

  async listForUser(
    _userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: ArticleReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [articles, total] = await Promise.all([
      this.repo.findPendingPaginated(offset, limit),
      this.repo.countByStatus('Pending'),
    ]);
    const items: ArticleReviewListItem[] = articles.map((a) => ({
      articleId: a.id,
      title: a.title,
      preview: ArticleReviewProvider.stripHtml(a.content).slice(0, 200),
      category: a.category,
      authorId: a.authorId,
      authorName: a.authorName,
      submittedAt: a.updatedAtUtc.toISOString(),
    }));
    return { items, total };
  }

  /**
   * Naivní HTML stripper. TipTap output je sanitized HTML — `<` v textovém
   * obsahu by byl jako `&lt;`, takže greedy regex je bezpečný.
   */
  static stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
