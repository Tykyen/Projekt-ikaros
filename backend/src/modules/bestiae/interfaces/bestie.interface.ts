/**
 * 10.2d-prep-B — Bestie entity rozhraní (FE+BE shared shape).
 */
export interface Bestie {
  id: string;
  scope: 'system' | 'user' | 'world';
  systemId: string;
  ownerUserId?: string;
  worldId?: string;
  name: string;
  imageUrl?: string;
  /** Výřez obrázku — parity s GameEvent/WorldNews/Page (focal + zoom + fit). */
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  /** GM poznámky (jen PJ). */
  notes: string;
  /** Veřejný popis bytosti (16.2h); vidí i hráč. */
  description: string;
  // Schopnosti = `systemStats.abilities` (per-system schéma); top-level pole
  // `abilities` zrušeno (D-NEW-BESTIE-ABILITIES-DUP).
  systemStats: Record<string, unknown>;
  clonedFromId?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
