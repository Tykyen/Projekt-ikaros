import type { GameEvent } from './game-event.interface';

export interface IGameEventRepository {
  findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]>;
  markReminderSent(id: string): Promise<void>;
  deleteOlderThan(before: Date): Promise<number>;
  findByWorld(worldId: string): Promise<GameEvent[]>;
  findOne(id: string): Promise<GameEvent | null>;
  create(data: Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameEvent>;
  update(id: string, data: Partial<GameEvent>): Promise<GameEvent | null>;
  delete(id: string): Promise<void>;
  confirm(id: string): Promise<GameEvent | null>;
}
