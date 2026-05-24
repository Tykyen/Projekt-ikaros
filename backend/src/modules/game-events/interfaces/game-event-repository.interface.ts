import type { GameEvent } from './game-event.interface';

export interface ListFilters {
  worldId: string;
  limit?: number;
  /** ISO 8601 — vrátí jen akce s `date >= fromDate`. */
  fromDate?: string;
  /** ISO 8601 — vrátí jen akce s `date <= toDate`. Pokud bez `fromDate`, sort DESC (archive). */
  toDate?: string;
}

export interface IGameEventRepository {
  findById(id: string): Promise<GameEvent | null>;
  findList(filters: ListFilters): Promise<GameEvent[]>;
  create(
    data: Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<GameEvent>;
  update(
    id: string,
    data: Partial<Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<GameEvent | null>;
  delete(id: string): Promise<boolean>;

  findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]>;
  findUpcomingForWorlds(
    worldIds: string[],
    fromDate: string,
    limit: number,
  ): Promise<GameEvent[]>;
  markReminderSent(id: string): Promise<void>;
}
