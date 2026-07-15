/**
 * 20.6 — využití motivů a skinů pro admin přehled (podklad pro osekání
 * málo využívaných). Čistá agregace stavu DB, žádný nový tracking.
 * FE zrcadlo: `src/features/admin/api/themeUsage.types.ts`.
 */

export interface DimensionUsage {
  /** Celkem entit v dimenzi (users / worlds / memberships). */
  total: number;
  /**
   * Z toho bez explicitní volby (`field == null`/`''` → dědí default).
   * ⚠️ NENÍ „nevyužité" — tihle jedou na děděném defaultu (spec 20.6 §4).
   */
  noChoice: number;
  /**
   * `themeId`/`skinId` → počet ENTIT s explicitní volbou. Klíče = jen ID
   * skutečně vyskytnutá v DB (i legacy/neznámá — FE je označí přes registry).
   */
  counts: Record<string, number>;
}

export interface ThemeUsageStats {
  /** ISO timestamp snapshotu. */
  generatedAt: string;
  /** `User.themeId` — platformový motiv uživatele. */
  platformTheme: DimensionUsage;
  /** `World.themeId` — motiv světa. */
  worldTheme: DimensionUsage;
  /** `WorldMembership.themeId` — per-člen override motivu světa (5.9b). */
  memberTheme: DimensionUsage;
  /** `WorldMembership.diarySkin` — skin deníku (16.2c). */
  diarySkin: DimensionUsage;
  /** `WorldMembership.chatSkin` — skin chatu (16.1d). */
  chatSkin: DimensionUsage;
}
