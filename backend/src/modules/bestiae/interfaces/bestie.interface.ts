/**
 * 16.2b-2 — jedna pravidlová verze (statblok) komunitní bytosti. Klíč v mapě
 * `Bestie.statblocks` = systemId. Staty se mění jen schvalovacím tokem (§2a).
 */
export interface BestieStatblockEntry {
  systemStats: Record<string, unknown>;
  status: 'draft' | 'approved';
  authorId: string;
  createdAt: Date | string;
}

/**
 * 10.2d-prep-B — Bestie entity rozhraní (FE+BE shared shape).
 */
export interface Bestie {
  id: string;
  scope: 'system' | 'user' | 'world' | 'community';
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
  /**
   * B5 (spec 20B) — moderačně skrytá bestie (akce M2/M3). Čtení (list i detail)
   * ji vynechá; vidí ji jen platform reviewer (Admin+). Legacy bez pole = false.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  createdAt: Date;
  updatedAt: Date;

  // ── 16.2b-2 komunitní scope (jen scope='community') ──
  /** Latinský/ozdobný název (podtitul v knize). */
  latin?: string;
  /** Typ bytosti (drak/nemrtvý/…) — filtr knihovny. */
  kind?: string;
  tags?: string[];
  /** 'draft' = knihovna návrhů, 'approved' = schválená knihovna. */
  status?: 'draft' | 'approved';
  /** Atribuce autora (povinná u community). */
  authorId?: string;
  approvedAt?: Date | null;
  approvedBy?: string;
  /** Mapa systém→statblok. Klíč = systemId. */
  statblocks?: Record<string, BestieStatblockEntry>;
}
