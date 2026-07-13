import type {
  WorldCurrencies,
  WorldCurrencyItem,
} from './world-currencies.interface';

export interface IWorldCurrenciesRepository {
  findByWorldId(worldId: string): Promise<WorldCurrencies | null>;
  upsert(worldId: string, items: WorldCurrencyItem[]): Promise<WorldCurrencies>;
  /**
   * D-NEW-INV-DATA-SYNC — atomický optimistic lock (vzor pages RC-P1):
   * přepíše `items` JEN pokud se `updatedAt` mezitím nezměnil (podmínka
   * ve filtru). Vrací `null` při neshodě verze (konflikt) i pokud dokument
   * neexistuje — rozlišení řeší volající (service má dokument načtený).
   */
  replaceIfUnchanged(
    worldId: string,
    items: WorldCurrencyItem[],
    expectedUpdatedAt: Date,
  ): Promise<WorldCurrencies | null>;
}
