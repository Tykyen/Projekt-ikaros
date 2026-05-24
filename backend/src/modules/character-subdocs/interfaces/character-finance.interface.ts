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
  /** 8.1-FIR (2026-05-24) — RichText „Rozepsané" Matrix-style. */
  notes: string;
  /** D-073 (2026-05-23) — optimistic concurrency token. */
  updatedAt?: Date;
}
