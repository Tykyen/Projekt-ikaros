import type { WorldCalendarConfig } from './world-calendar-config.interface';

export interface IWorldCalendarConfigRepository {
  findByWorldId(worldId: string): Promise<WorldCalendarConfig | null>;
  upsert(
    worldId: string,
    data: Omit<
      WorldCalendarConfig,
      'id' | 'worldId' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<WorldCalendarConfig>;
}
