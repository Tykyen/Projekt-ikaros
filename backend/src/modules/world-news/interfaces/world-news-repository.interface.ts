import type { WorldNewsItem } from './world-news.interface';

export interface FindOptions {
  /** undefined = bez filtru (vše); string = svět + globální (union) */
  worldId?: string;
  /** clamped 1..200, default 50 — repo dostane už hotové číslo */
  limit: number;
}

export interface IWorldNewsRepository {
  findMany(opts: FindOptions): Promise<WorldNewsItem[]>;
  findById(id: string): Promise<WorldNewsItem | null>;
  create(data: Omit<WorldNewsItem, 'id'>): Promise<WorldNewsItem>;
  update(
    id: string,
    patch: Partial<Omit<WorldNewsItem, 'id' | 'worldId'>>,
  ): Promise<WorldNewsItem | null>;
  delete(id: string): Promise<boolean>;
}
