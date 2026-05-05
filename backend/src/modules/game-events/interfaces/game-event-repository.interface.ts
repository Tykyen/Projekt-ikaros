import type { GameEvent } from './game-event.interface';

export interface IGameEventRepository {
  findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]>;
  markReminderSent(id: string): Promise<void>;
  deleteOlderThan(before: Date): Promise<number>;
}
