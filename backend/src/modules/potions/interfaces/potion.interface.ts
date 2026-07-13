/**
 * 21.5b — Lektvary (komunitní katalog). Entity rozhraní (FE+BE shared).
 *
 * Lektvar = jádro (druh + suroviny s množstvím + „oznámení" + obrázek +
 * navrhovaná cena) + mapa `statblocks` per systém (vzor spells 21.5c).
 * Šablony polí vynucuje FE; BE ukládá `systemStats` schema-less (spec R5).
 * Jen `scope='community'`.
 */
import { UserRole } from '../../users/interfaces/user.interface';

/** Surovina receptu — co a kolik (spec-21.5b R3, min. 1 na lektvar). */
export interface PotionIngredient {
  name: string;
  /** Množství volným textem („2×", „1 dram", „hrst"). */
  amount?: string;
}

/** Jedna pravidlová verze lektvaru (statblok) — klíč v `statblocks` = systemId. */
export interface PotionStatblockEntry {
  systemStats: Record<string, unknown>;
  /** 'draft' = návrh, 'approved' = kurátorem přijaté jako balancnuté. */
  status: 'draft' | 'approved';
  authorId: string;
  createdAt: Date;
}

export interface Potion {
  id: string;
  scope: 'community';
  /** Primární systém (lektvar vznikl pro něj); reálné verze ve `statblocks`. */
  systemId: string;
  name: string;
  /** Alternativní/lidová jména (volný text). */
  aliases?: string;
  imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré dokumenty nemají. */
  imageBytes?: number;
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  /** Druh lektvaru (léčivý/jed/…) — systémově neutrální, filtr (spec R2). */
  kind: string;
  /** Suroviny s množstvím (spec R3, min. 1). */
  ingredients: PotionIngredient[];
  /** „Oznámení" — popis účinku / lore. */
  description: string;
  tags?: string[];
  /** Navrhovaná cena (bez měny) — předvyplní vklad do obchodu. null = neuvedeno. */
  suggestedPrice?: number | null;
  /** 'draft' = knihovna návrhů, 'approved' = schválená knihovna. */
  status: 'draft' | 'approved';
  authorId: string;
  approvedAt?: Date | null;
  approvedBy?: string;
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  /** Mapa systém→statblok. Staty se ladí schvalovacím tokem (vzor 21.5c). */
  statblocks: Record<string, PotionStatblockEntry>;
  createdAt: Date;
  updatedAt: Date;
}

/** Zúžený přihlášený uživatel předávaný do service (z JWT). */
export interface CurrentUser {
  id: string;
  role: UserRole;
}
