import type { IkarosDiscussionPost } from './ikaros-discussion.interface';

export interface IIkarosDiscussionPostsRepository {
  findByDiscussion(
    discussionId: string,
    skip: number,
    limit: number,
  ): Promise<IkarosDiscussionPost[]>;
  findById(id: string): Promise<IkarosDiscussionPost | null>;
  create(data: Omit<IkarosDiscussionPost, 'id'>): Promise<IkarosDiscussionPost>;
  delete(id: string): Promise<boolean>;
  deleteByDiscussion(discussionId: string): Promise<void>;
}
