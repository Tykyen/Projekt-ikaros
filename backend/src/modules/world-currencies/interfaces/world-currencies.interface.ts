export interface WorldCurrencyItem {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

export interface WorldCurrencies {
  id: string;
  worldId: string;
  items: WorldCurrencyItem[];
  updatedAt: Date;
}
