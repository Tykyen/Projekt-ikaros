import type {
  IkarosArticle,
  ArticleStatus,
  ArticleRating,
} from './ikaros-article.interface';

export interface IIkarosArticlesRepository {
  findPublished(): Promise<IkarosArticle[]>;
  findPublishedAndPending(): Promise<IkarosArticle[]>;
  // D-NEW-search-be — Mongo $text fulltext search.
  searchPublished(search: string): Promise<IkarosArticle[]>;
  searchPublishedAndPending(search: string): Promise<IkarosArticle[]>;
  findPending(): Promise<IkarosArticle[]>;
  findByAuthor(authorId: string): Promise<IkarosArticle[]>;
  /** 3.7 — články dle seznamu id (oblíbené). Vrací jen existující. */
  findByIds(ids: string[]): Promise<IkarosArticle[]>;
  findById(id: string): Promise<IkarosArticle | null>;
  create(data: Omit<IkarosArticle, 'id'>): Promise<IkarosArticle>;
  update(
    id: string,
    data: Partial<IkarosArticle>,
  ): Promise<IkarosArticle | null>;
  upsertRating(
    id: string,
    rating: ArticleRating,
  ): Promise<IkarosArticle | null>;
  delete(id: string): Promise<boolean>;
  countByAuthorAndStatus(
    authorId: string,
  ): Promise<Record<ArticleStatus, number>>;
  /** 3.2a — Pending paginated (pro ArticleReviewProvider). */
  findPendingPaginated(offset: number, limit: number): Promise<IkarosArticle[]>;
  /** 3.2a — počet článků v daném statu (pro provider count + unread aggregate). */
  countByStatus(status: ArticleStatus): Promise<number>;
  /** 3.2a — pro categories validation (article_in_use check při delete). */
  countByCategory(category: string): Promise<number>;
  /** 3.2a — published IDs (pro unreadCount aggregate). */
  findPublishedIds(): Promise<string[]>;
  /** 12.1 — celkový počet článků (admin dashboard). */
  countAll(): Promise<number>;
  /** D-SEC-GAP-2026-07-11 — anti-abuse: počet článků autora (creation cap). */
  countByAuthor(authorId: string): Promise<number>;
}
