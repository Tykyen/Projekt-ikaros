import type {
  IkarosArticle,
  ArticleStatus,
  ArticleRating,
} from './ikaros-article.interface';

export interface IIkarosArticlesRepository {
  findPublished(): Promise<IkarosArticle[]>;
  findPublishedAndPending(): Promise<IkarosArticle[]>;
  findPending(): Promise<IkarosArticle[]>;
  findByAuthor(authorId: string): Promise<IkarosArticle[]>;
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
}
