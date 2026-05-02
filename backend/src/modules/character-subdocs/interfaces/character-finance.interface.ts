export interface FinanceEntry {
  id: string;
  label: string;
  amount: number;
}

export interface FinanceTransaction {
  id: string;
  date: Date;
  delta: number;
  description: string;
}

export interface CharacterFinance {
  id: string;
  characterId: string;
  isHidden: boolean;
  accountType: string;
  accessLocation: string;
  currency: string;
  lastSyncDate?: Date;
  balance: number;
  entries: FinanceEntry[];
  transactions: FinanceTransaction[];
}
