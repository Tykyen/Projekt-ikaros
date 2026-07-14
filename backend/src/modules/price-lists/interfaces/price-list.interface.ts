/**
 * 21.5f — Ceníky (komunitní knihovna ceníků). Entity rozhraní (FE+BE shared).
 *
 * Ceník = JEDEN dokument s vnořenými položkami (`items[]`, max 200) — ne
 * samostatné katalogové entity (R1 spec 21.5f). Cena položky strukturovaně
 * zlaté/stříbrné/měďáky (pevný poměr 1:10:100, R2). Per-systém staty zbraní
 * a zbrojí řeší LINK na komunitní předmět (`linkedItemId`, R4) — žádná
 * statblocková mašinerie tady. Vzor: plant.interface.ts.
 */
import { UserRole } from '../../users/interfaces/user.interface';

/** Max položek jednoho ceníku (= limit bulk dávky obchodu, spec R1). */
export const PRICE_LIST_MAX_ITEMS = 200;

/**
 * 21.5g — měna ceníku. Uložení ceny je vždy `{gold,silver,copper}` (1:10:100);
 * měna určuje jen ZOBRAZENÍ: gsc = zl/st/md, usd = $ (gold=dolary, copper=centy),
 * credits = kredity (éra Budoucnost, zatím jen rezervovaná hodnota).
 */
export const PRICE_LIST_CURRENCIES = ['gsc', 'usd', 'credits'] as const;
export type PriceListCurrency = (typeof PRICE_LIST_CURRENCIES)[number];

/** Jedna položka ceníku (vnořený subdokument, pořadí = pořadí v poli). */
export interface PriceListItem {
  /** UUID položky (generuje service při create/update, když chybí). */
  id: string;
  name: string;
  description?: string;
  /** Sekce uvnitř ceníku („V hospodě", region…) — FE seskupuje. */
  section?: string;
  imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10). */
  imageBytes?: number;
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  /** R6 — atribuce převzatého obrázku (autor · zdroj · licence). */
  imageCredit?: string;
  /** Cena: zlaté / stříbrné / měďáky (celá čísla ≥ 0, poměr 1:10:100). */
  gold: number;
  silver: number;
  copper: number;
  /** R4 — link na komunitní předmět (`community_items`) se staty per systém. */
  linkedItemId?: string;
}

export interface PriceList {
  id: string;
  scope: 'community';
  name: string;
  description?: string;
  imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré dokumenty nemají. */
  imageBytes?: number;
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  tags?: string[];
  /** 21.5g — měna zobrazení cen (default 'gsc'; uložení vždy gold/silver/copper). */
  currency: PriceListCurrency;
  items: PriceListItem[];
  /** 'draft' = knihovna návrhů, 'approved' = schválená knihovna. */
  status: 'draft' | 'approved';
  /** Atribuce autora (povinná). */
  authorId: string;
  approvedAt?: Date | null;
  approvedBy?: string;
  /** Moderačně skrytý ceník (parity s herbářem) — čtení vynechá, Admin+ vidí. */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Komentář k ceníku (jedna úroveň — bez statblockové diskuse, R7). */
export interface PriceListComment {
  id: string;
  priceListId: string;
  authorId: string;
  authorName: string;
  content: string;
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Zúžený přihlášený uživatel předávaný do service (z JWT). */
export interface CurrentUser {
  id: string;
  role: UserRole;
}
