import type { TimelineEvent } from './timeline-event.interface';
import type { TimelineCursor, TimelineSort } from '../lib/timeline-cursor';

export interface TimelineFindOptions {
  worldId: string;
  limit: number; // clamped 1..500, default 100
  fromYear?: number;
  toYear?: number;
  /** 9.3 — case-insensitive substring search v title+text (caller MUSÍ escape). */
  search?: string;
  /** 9.3 — kurzor z předchozí stránky pro pokračování (lexikograficky). */
  cursor?: TimelineCursor;
  /** 9.3 — pořadí výsledků. Default `desc`. */
  sort?: TimelineSort;
}

export interface TimelinePage {
  events: TimelineEvent[];
  /** Cursor poslední položky pokud `events.length === limit`, jinak `null`. */
  nextCursor: TimelineCursor | null;
}

export interface ITimelineRepository {
  findMany(opts: TimelineFindOptions): Promise<TimelinePage>;
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
  /** 9.3 — aggregate {year, count} DESC pro YearScrubber. */
  yearCounts(worldId: string): Promise<Array<{ year: number; count: number }>>;
}
