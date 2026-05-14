import type {
  WorldCurrencies,
  WorldCurrencyItem,
} from './world-currencies.interface';

export interface IWorldCurrenciesRepository {
  findByWorldId(worldId: string): Promise<WorldCurrencies | null>;
  upsert(worldId: string, items: WorldCurrencyItem[]): Promise<WorldCurrencies>;
}
