export type WorldNewsType = 'info' | 'alert' | 'system';

/** 5.5b — scope pro archiv: aktivní (default, public) / archiv / oba. */
export type WorldNewsScope = 'active' | 'archived' | 'all';

export interface WorldNewsItem {
  id: string;
  worldId: string | null; // null = globální
  title: string;
  content: string;
  date: string; // ISO 8601 v UTC (...Z)
  type: WorldNewsType;
  link?: string;
  /** 9.5 — interní link na wiki stránku světa (slug). Priorita před `link`. */
  linkPageSlug: string | null;
  /** 9.5 — hero obrázek (parita s 9.1 game events). */
  imageUrl: string | null;
  imageFocalX: number | null;
  imageFocalY: number | null;
  imageZoom: number | null;
  imageFit: 'cover' | 'contain' | null;
  /** 9.2e — slug kalendáře pro fantasy datum (null = real-world gregorian display). */
  calendarConfigId: string | null;
  /** 9.2e — fantasy datum oznámení. Pokud null, FE zobrazí real-world `date`. */
  calendarDate: {
    year: number;
    monthIndex: number;
    day: number;
    hour?: number;
    minute?: number;
  } | null;
  createdBy?: string; // userId; undefined u legacy migrovaných
  archived: boolean; // 5.5b — archivovaná novinka (legacy bez pole = false)
  /**
   * B5 (spec 20B) — moderačně skrytá novinka (akce M2/M3). Veřejné čtení
   * (list i detail) ji vynechá; vidí ji jen platform reviewer (Admin+).
   * Legacy bez pole = false.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
}
