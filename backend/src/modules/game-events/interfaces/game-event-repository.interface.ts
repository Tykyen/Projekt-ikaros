import type { GameEvent } from './game-event.interface';

export interface ListFilters {
  worldId: string;
  limit?: number;
  fromDate?: string;
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
  deleteOlderThan(before: Date): Promise<number>;
}
