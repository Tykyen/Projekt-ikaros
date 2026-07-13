/**
 * 21.5c — Kouzla (komunitní katalog). Entity rozhraní (FE+BE shared).
 *
 * Kouzlo = systémově neutrální jádro („oznámení" + obrázek) + mapa
 * `statblocks` per systém (jako komunitní bestie) — kouzlo je bytostně
 * systémové, každý systém má jiná pole (spec-21.5c R1). Šablony polí vynucuje
 * FE formulář; BE ukládá `systemStats` schema-less (spec R6).
 * Jen `scope='community'` (vzor plants).
 */
import { UserRole } from '../../users/interfaces/user.interface';

/** Jedna pravidlová verze kouzla (statblok) — klíč v `statblocks` = systemId. */
export interface SpellStatblockEntry {
  systemStats: Record<string, unknown>;
  /** 'draft' = návrh, 'approved' = kurátorem přijaté jako balancnuté. */
  status: 'draft' | 'approved';
  authorId: string;
  createdAt: Date;
}

export interface Spell {
  id: string;
  scope: 'community';
  /** Primární systém (kouzlo vzniklo pro něj); reálné verze ve `statblocks`. */
  systemId: string;
  /** Název kouzla. */
  name: string;
  /** Alternativní/lidová jména (volný text). */
  aliases?: string;
  imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré dokumenty nemají. */
  imageBytes?: number;
  /** Výřez obrázku — parity s Bestie/Plant (focal + zoom + fit). */
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  /** „Oznámení" — lore/popis účinku kouzla (volný text). */
  description: string;
  tags?: string[];
  /** 'draft' = knihovna návrhů, 'approved' = schválená knihovna. */
  status: 'draft' | 'approved';
  /** Atribuce autora (povinná). */
  authorId: string;
  approvedAt?: Date | null;
  approvedBy?: string;
  /**
   * Moderačně skryté kouzlo (parity s bestiae/plants). Čtení je vynechá;
   * vidí jen platform reviewer (Admin+). Legacy bez pole = false.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  /** Mapa systém→statblok. Staty se ladí schvalovacím tokem (spec §2a bestiáře). */
  statblocks: Record<string, SpellStatblockEntry>;
  createdAt: Date;
  updatedAt: Date;
}

/** Zúžený přihlášený uživatel předávaný do service (z JWT). */
export interface CurrentUser {
  id: string;
  role: UserRole;
}
