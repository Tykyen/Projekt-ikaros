/**
 * 8.6 — Per-postava finanční účet. Postava může mít 0..20 účtů.
 * Sdílené účty: `ownerCharacterIds.length > 1`, primary je default vlastník.
 */
export interface CharacterAccount {
  id: string;
  worldId: string;
  label: string;
  ownerCharacterIds: string[];
  primaryOwnerId: string;
  /** Volné textové pole, PJ-only edit (typ: „Osobní" / „Společný" / „Tajný" / vlastní). */
  accountType: string;
  /**
   * „Vedeno u" — reference na postavu (typicky Lokace = banka, NPC = správce,
   * případně PC = pokladník party). `null` = nikam nezavedeno.
   */
  accessLocation: { type: 'character'; characterId: string } | null;
  /** Kód měny ze `world_currencies` (např. 'ZL', 'CR'). */
  currency: string;
  /** Cached součet z transactions — aktualizováno atomicky při appendTransaction. */
  balance: number;
  incomeEntries: FinanceEntry[];
  expenseEntries: FinanceEntry[];
  transactions: FinanceTransaction[];
  notes: string;
  /**
   * Spec 8.x-prep §4.3 (B3) — pokud true, hráč-vlastník smí volat adjust
   * (vklad i výběr s povinným důvodem). Default false → jen PJ+.
   */
  allowPlayerSelfAdjust?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FinanceEntry {
  id: string;
  label: string;
  amount: number; // vždy kladné, sign odvozený z pole (income vs expense)
}

/**
 * Spec 8.x-prep §4.4 (B4) — herní datum transakce (oproti `date` = real-world
 * timestamp). BE entity nepracuje s calendar engine; ukládá jako JSON.
 */
export interface FantasyDateLike {
  year: number;
  monthIndex: number; // 0-based
  day: number; // 1-based
  hour?: number;
  minute?: number;
}

export interface FinanceTransaction {
  id: string;
  date: Date;
  /**
   * Spec 8.x-prep §4.4 — in-game datum, kdy se transakce herně odehrála.
   * Optional pro backward compat (existující transakce mají undefined).
   */
  inGameDate?: FantasyDateLike | null;
  delta: number;
  description: string;
  /** Pokud transakce vznikla transferem. */
  transferRef?: {
    counterpartyAccountId: string;
    counterpartyCharacterId: string;
    direction: 'in' | 'out';
  };
  /**
   * PT-43b/c/d — původ transakce mimo ruční adjust. `'purchase'` = odečet
   * nákupu (purchase log drží protistranu: položku v inventáři). Undo takovou
   * tx nesmí popnout — vrácení řeší storno nákupu, ne undo.
   */
  origin?: 'purchase';
  /** Audit — user (ne character), který akci provedl. */
  performedByUserId: string;
}
