/**
 * Spec 3.1b — typ novinky. Určuje barvu nadpisu na FE
 * (info = fialová, warning = červená, system = zelená).
 */
export type IkarosNewsType = 'info' | 'warning' | 'system';

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
  /** Spec 3.1 — revertibilní soft toggle pro archiv. Default `false`. */
  archived?: boolean;
  archivedAtUtc?: Date;
  archivedByUserId?: string;
  /** Spec 3.1b — typ novinky. Legacy dokumenty bez pole = `'info'`. */
  type?: IkarosNewsType;
  /** Spec 3.1b — URL obrázku (Cloudinary). Volitelné. */
  imageUrl?: string;
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
  /** Spec 3.1 — vždy přítomné (default false, dataset bez pole se zobrazí jako false). */
  archived: boolean;
  archivedAtUtc?: Date;
  archivedByUserId?: string;
  /** Spec 3.1b — vždy přítomné (default `'info'` pro legacy dataset). */
  type: IkarosNewsType;
  /** Spec 3.1b — URL obrázku nebo `undefined`. */
  imageUrl?: string;
}
