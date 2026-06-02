import type { IkarosDiscussion } from './ikaros-discussion.interface';

export interface IIkarosDiscussionsRepository {
  findAll(): Promise<IkarosDiscussion[]>;
  /** D-NEW-discussion-pagination — paged list (sort lastActivity desc). */
  findAllPaginated(
    offset: number,
    limit: number,
  ): Promise<{ items: IkarosDiscussion[]; total: number }>;
  findPending(): Promise<IkarosDiscussion[]>;
  findPendingPaginated(
    skip: number,
    limit: number,
  ): Promise<IkarosDiscussion[]>;
  countPending(): Promise<number>;
  /** 12.1 — celkový počet diskuzí (admin dashboard). */
  countAll(): Promise<number>;
  findManagedWithJoinRequests(userId: string): Promise<IkarosDiscussion[]>;
  findByIds(ids: string[]): Promise<IkarosDiscussion[]>;
  findById(id: string): Promise<IkarosDiscussion | null>;
  create(data: Omit<IkarosDiscussion, 'id'>): Promise<IkarosDiscussion>;
  update(
    id: string,
    data: Partial<IkarosDiscussion>,
  ): Promise<IkarosDiscussion | null>;
  adjustLikeCount(id: string, delta: number): Promise<IkarosDiscussion | null>;
  adjustPostCount(
    id: string,
    delta: number,
    touchActivity?: boolean,
  ): Promise<void>;
  delete(id: string): Promise<boolean>;
}
