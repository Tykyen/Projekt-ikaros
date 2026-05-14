/**
 * DB entity. `authorName` je legacy denormalizovaný snapshot — nové zápisy
 * ho neukládají, ale staré pre-2026-05-06 záznamy ho mají.
 */
export interface IkarosNewsItem {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName?: string;
  createdAtUtc: Date;
  isActive: boolean;
}

/**
 * API response. `authorName` je vždy přítomen — joinnut z Users při čtení,
 * s fallbackem na legacy `authorName` z DB pro smazané/neexistující uživatele.
 */
export interface IkarosNewsResponse {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAtUtc: Date;
  isActive: boolean;
}
