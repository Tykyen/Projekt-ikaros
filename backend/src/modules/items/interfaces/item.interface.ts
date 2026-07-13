/**
 * 21.5e — Předměty (komunitní katalog). Entity rozhraní (FE+BE shared).
 *
 * Předmět = jádro (druh — řídí variantu polí statbloku — + „oznámení" +
 * obrázek + navrhovaná cena) + mapa `statblocks` per systém (vzor spells
 * 21.5c). Šablony polí vynucuje FE; BE ukládá `systemStats` schema-less
 * (spec R6). Jen `scope='community'`.
 */
import { UserRole } from '../../users/interfaces/user.interface';

/** Jedna pravidlová verze předmětu (statblok) — klíč v `statblocks` = systemId. */
export interface ItemStatblockEntry {
  systemStats: Record<string, unknown>;
  /** 'draft' = návrh, 'approved' = kurátorem přijaté jako balancnuté. */
  status: 'draft' | 'approved';
  authorId: string;
  createdAt: Date;
}

export interface Item {
  id: string;
  scope: 'community';
  /** Primární systém (předmět vznikl pro něj); reálné verze ve `statblocks`. */
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
  /** Druh předmětu (zbraň/zbroj/…) — filtr + volba varianty polí (spec R1/R2). */
  kind: string;
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
  statblocks: Record<string, ItemStatblockEntry>;
  createdAt: Date;
  updatedAt: Date;
}

/** Zúžený přihlášený uživatel předávaný do service (z JWT). */
export interface CurrentUser {
  id: string;
  role: UserRole;
}
