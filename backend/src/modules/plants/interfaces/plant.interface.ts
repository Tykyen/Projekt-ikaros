/**
 * 21.5a — Herbář (komunitní katalog rostlin). Entity rozhraní (FE+BE shared).
 *
 * Herbář je JEN globální komunitní katalog (`scope='community'`). Žádný
 * system/user/world scope, žádné boj/statblok/spawn — na rozdíl od bestiáře.
 * `statblocks` je prázdná mapa připravená na budoucí per-systém staty (zatím
 * se needituje). Vzor: bestie.interface.ts (community část), zjednodušeno.
 */
import { UserRole } from '../../users/interfaces/user.interface';

/** Vzácnost rostliny — 5 stupňů (filtr knihovny). */
export const PLANT_RARITIES = [
  'bezna',
  'stredne_bezna',
  'stredne_vzacna',
  'vzacna',
  'velmi_vzacna',
] as const;
export type PlantRarity = (typeof PLANT_RARITIES)[number];

export interface Plant {
  id: string;
  scope: 'community';
  /** Primární název. */
  name: string;
  /** Lidová/regionální jména (volný text). */
  aliases?: string;
  imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré dokumenty nemají. */
  imageBytes?: number;
  /** Výřez obrázku — parity s GameEvent/WorldNews/Bestie (focal + zoom + fit). */
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  /** „Roste" — kde rostlina roste (volný text). */
  habitat?: string;
  /** „Použití" — k čemu je (volný text). */
  usage?: string;
  /** Vzácnost — 5 stupňů. */
  rarity?: PlantRarity;
  /** Volný dovětek k vzácnosti. */
  rarityNote?: string;
  description?: string;
  tags?: string[];
  /** Navrhovaná cena (bez měny). null = neuvedeno. */
  suggestedPrice?: number | null;
  /** 'draft' = knihovna návrhů, 'approved' = schválená knihovna. */
  status: 'draft' | 'approved';
  /** Atribuce autora (povinná). */
  authorId: string;
  approvedAt?: Date | null;
  approvedBy?: string;
  /**
   * Moderačně skrytá rostlina (parity s bestiae). Čtení (list i detail) ji
   * vynechá; vidí ji jen platform reviewer (Admin+). Legacy bez pole = false.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  /**
   * Prázdná mapa systém→staty; připraveno na budoucí per-systém staty. Zatím se
   * needituje (herbář nemá boj/statblok logiku).
   */
  statblocks: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Zúžený přihlášený uživatel předávaný do service (z JWT). */
export interface CurrentUser {
  id: string;
  role: UserRole;
}
