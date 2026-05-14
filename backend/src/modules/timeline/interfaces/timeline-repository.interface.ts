import type { TimelineEvent } from './timeline-event.interface';

export interface TimelineFindOptions {
  worldId: string;
  limit: number; // clamped 1..500, default 100
  fromYear?: number;
  toYear?: number;
}

export interface ITimelineRepository {
  findMany(opts: TimelineFindOptions): Promise<TimelineEvent[]>;
  findById(id: string): Promise<TimelineEvent | null>;
  create(
    data: Omit<TimelineEvent, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TimelineEvent>;
  update(
    id: string,
    patch: Partial<
      Omit<TimelineEvent, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<TimelineEvent | null>;
  delete(id: string): Promise<boolean>;
}
