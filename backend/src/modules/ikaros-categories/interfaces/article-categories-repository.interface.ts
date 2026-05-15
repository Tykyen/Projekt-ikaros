import type { ArticleCategory } from './article-category.interface';

export interface IArticleCategoriesRepository {
  findAll(): Promise<ArticleCategory[]>;
  findByKey(key: string): Promise<ArticleCategory | null>;
  create(data: Omit<ArticleCategory, 'createdAtUtc'>): Promise<ArticleCategory>;
  update(
    key: string,
    patch: Partial<Omit<ArticleCategory, 'key' | 'createdAtUtc'>>,
  ): Promise<ArticleCategory | null>;
  delete(key: string): Promise<boolean>;
}
