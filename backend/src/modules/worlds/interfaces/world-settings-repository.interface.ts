import { WorldSettings } from './world-settings.interface';

export interface IWorldSettingsRepository {
  findByWorldId(worldId: string): Promise<WorldSettings | null>;
  upsert(worldId: string, data: Partial<WorldSettings>): Promise<WorldSettings>;
}
