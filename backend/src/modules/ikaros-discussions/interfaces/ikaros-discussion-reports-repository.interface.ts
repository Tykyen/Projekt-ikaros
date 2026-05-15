import type { IkarosDiscussionReport } from './ikaros-discussion.interface';

export interface IIkarosDiscussionReportsRepository {
  create(
    data: Omit<IkarosDiscussionReport, 'id'>,
  ): Promise<IkarosDiscussionReport>;
  findById(id: string): Promise<IkarosDiscussionReport | null>;
  findUnresolved(
    skip: number,
    limit: number,
  ): Promise<IkarosDiscussionReport[]>;
  countUnresolved(): Promise<number>;
  markResolved(id: string): Promise<void>;
}
