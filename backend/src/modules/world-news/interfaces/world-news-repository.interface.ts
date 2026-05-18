import type { WorldNewsItem, WorldNewsScope } from './world-news.interface';

export interface FindOptions {
  /** undefined = bez filtru (vše); string = svět + globální (union) */
  worldId?: string;
  /** clamped 1..200, default 50 — repo dostane už hotové číslo */
  limit: number;
  /** 5.5b — výchozí 'active'; 'archived' / 'all' jen oprávněným */
  scope?: WorldNewsScope;
  /** 5.5b — offset paginace, >= 0 */
  offset?: number;
}

export interface CountOptions {
  worldId?: string;
  scope?: WorldNewsScope;
}

export interface IWorldNewsRepository {
  findMany(opts: FindOptions): Promise<WorldNewsItem[]>;
  count(opts: CountOptions): Promise<number>;
  findById(id: string): Promise<WorldNewsItem | null>;
  create(data: Omit<WorldNewsItem, 'id'>): Promise<WorldNewsItem>;
  update(
    id: string,
    patch: Partial<Omit<WorldNewsItem, 'id' | 'worldId'>>,
  ): Promise<WorldNewsItem | null>;
  /** 5.5b — nastaví archived flag + audit pole; idempotentní. */
  setArchived(
    id: string,
    archived: boolean,
    userId: string,
  ): Promise<WorldNewsItem | null>;
  delete(id: string): Promise<boolean>;
}
