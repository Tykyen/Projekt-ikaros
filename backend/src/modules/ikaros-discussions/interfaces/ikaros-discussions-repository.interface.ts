import type { IkarosDiscussion } from './ikaros-discussion.interface';

export interface IIkarosDiscussionsRepository {
  findAll(): Promise<IkarosDiscussion[]>;
  findPending(): Promise<IkarosDiscussion[]>;
  findByIds(ids: string[]): Promise<IkarosDiscussion[]>;
  findById(id: string): Promise<IkarosDiscussion | null>;
  create(data: Omit<IkarosDiscussion, 'id'>): Promise<IkarosDiscussion>;
  update(id: string, data: Partial<IkarosDiscussion>): Promise<IkarosDiscussion | null>;
  delete(id: string): Promise<boolean>;
}
