/**
 * 19.3 — Nábor (LFG). Vlastní platformová entita. Motiv = world-scope theme
 * (12); tvar+barva lístku na FE. Moderace: autor + Správce diskuzí + Admin +
 * Superadmin (ADMIN_ROLES). Kontaktní smyčka „Ozvat se" = přímá zpráva.
 */

export type NaborStrana = 'hledam-hru' | 'hledam-hrace';

export type NaborMotiv =
  | 'fantasy'
  | 'dark-fantasy'
  | 'vesmir'
  | 'cyberpunk'
  | 'steampunk'
  | 'apokalypsa'
  | 'horor'
  | 'mystery'
  | 'historie'
  | 'moderni'
  | 'western'
  | 'ikaros';

export type NaborMode = 'online' | 'zivo';

export type NaborStatus = 'open' | 'closed' | 'expired';

export interface Nabor {
  id: string;
  strana: NaborStrana;
  motiv: NaborMotiv;
  worldId?: string;
  worldSlug?: string;
  worldName?: string;
  title: string;
  body: string;
  imageUrl?: string;
  system?: string;
  mode: NaborMode;
  place?: string;
  seatsTotal?: number;
  seatsTaken?: number;
  status: NaborStatus;
  authorId: string;
  authorName: string;
  authorIsDeleted?: boolean;
  /** Počet nahlášení (post-moderace) — vidí moderátoři. */
  reportCount?: number;
  /**
   * B4b (spec 20B) — true = nábor skryt moderací (akce M2/M3). Veřejná nástěnka
   * i detail ho vynechají; vidí ho jen reviewer set.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  createdAtUtc: Date;
  expiresAtUtc?: Date;
}
