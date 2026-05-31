/**
 * 10.2j — PJ poznámkový blok na svět (world-level, per-PJ). Jedna volná
 * RichText plocha. Otevírá se z taktické mapy tlačítkem pod počasím.
 */
export interface WorldGmNotes {
  id: string;
  worldId: string;
  userId: string;
  content: string;
  /** Optimistic concurrency token. */
  updatedAt?: Date;
}
