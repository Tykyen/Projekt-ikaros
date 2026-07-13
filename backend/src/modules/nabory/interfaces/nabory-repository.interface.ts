import type { Nabor } from './nabor.interface';

/** 19.3 — repository kontrakt nástěnky náborů. */
export interface INaboryRepository {
  /**
   * Aktivní nábory (ne expired, ne po expiraci) — sort dle createdAt desc.
   * B4b — `includeModerationHidden=true` (jen reviewer) vrátí i moderačně skryté.
   */
  findActive(includeModerationHidden?: boolean): Promise<Nabor[]>;
  findById(id: string): Promise<Nabor | null>;
  create(data: Omit<Nabor, 'id'>): Promise<Nabor>;
  update(id: string, data: Partial<Nabor>): Promise<Nabor | null>;
  delete(id: string): Promise<boolean>;
  /** Idempotentně přidá nahlašovatele; vrací aktualizovaný nábor. */
  addReport(id: string, userId: string): Promise<Nabor | null>;
  countAll(): Promise<number>;
  /** D-SEC-GAP-2026-07-11 — anti-abuse: počet živých náborů autora (creation cap). */
  countActiveByAuthor(authorId: string): Promise<number>;
}
