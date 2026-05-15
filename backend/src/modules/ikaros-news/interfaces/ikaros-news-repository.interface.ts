import type { IkarosNewsItem, IkarosNewsType } from './ikaros-news.interface';

/** Spec 3.1 — scope filter pro list/count endpointy. */
export type NewsScope = 'active' | 'archived' | 'all';

export interface FindOptions {
  /** Limit počtu vrácených novinek. Bez limitu vrací všechny. */
  limit?: number;
  /** Skip prvních N novinek (paginace). */
  offset?: number;
  /** Spec 3.1 — filter podle archive stavu. Default `'active'`. */
  scope?: NewsScope;
}

/** @deprecated D-068 alias — používej `FindOptions`. Zachováno pro BC v testech. */
export type FindActiveOptions = FindOptions;

/** Spec 3.1 — partial update payload pro PATCH /:id. */
export interface UpdateNewsFields {
  title?: string;
  content?: string;
  /** Spec 3.1b — změna typu novinky. */
  type?: IkarosNewsType;
  /** Spec 3.1b — `null` = odebrat obrázek. */
  imageUrl?: string | null;
}

export interface IIkarosNewsRepository {
  /** Spec 3.1 — list dle scope (default `'active'`). */
  findByScope(opts?: FindOptions): Promise<IkarosNewsItem[]>;
  /** Spec 3.1 — count dle scope (default `'active'`). */
  countByScope(scope?: NewsScope): Promise<number>;
  /** Spec 3.1 — lookup pro existence check / GET detail (interní). */
  findById(id: string): Promise<IkarosNewsItem | null>;
  create(data: Omit<IkarosNewsItem, 'id'>): Promise<IkarosNewsItem>;
  /** Spec 3.1 — partial update title/content. Vrací updated entity nebo null. */
  update(id: string, dto: UpdateNewsFields): Promise<IkarosNewsItem | null>;
  /** Spec 3.1 — set/unset archive flag + audit fields. Vrací updated nebo null. */
  setArchived(
    id: string,
    archived: boolean,
    userId?: string,
  ): Promise<IkarosNewsItem | null>;
  delete(id: string): Promise<boolean>;
}
