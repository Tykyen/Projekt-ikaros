export const PAGE_TYPES = {
  Lokace: 'Lokace',
  Noviny: 'Noviny',
  Seznam: 'Seznam',
  Galerie: 'Galerie',
  Rodokmen: 'Rodokmen',
  Obrazovka: 'Obrazovka',
  Ostatni: 'Ostatní',
  // Krok 9.1 — sjednocení Character → Page. PostavaHrace má `ownerUserId`,
  // NPC je bez. Subdokumenty (deník/finance/…) drží Character entita,
  // odkaz přes `characterRef.characterId`.
  PostavaHrace: 'Postava hráče',
  NPC: 'NPC',
} as const;

export type PageType = (typeof PAGE_TYPES)[keyof typeof PAGE_TYPES];

export interface AccessRequirement {
  type: 'UserId' | 'AKJ' | 'Role' | 'AKJType';
  value: string;
}

/**
 * D-062a — popis konkrétní překážky, kterou user nesplnil, pro
 * `GET /pages/meta/:slug`. Vrací se jen pro authenticated usery, kteří
 * nemají přístup, a obsahuje pouze nesplněné requirements (UserId se
 * záměrně neukazuje — kdo má přístup je tajné).
 */
export interface ShieldedRequirement {
  type: 'AKJ' | 'AKJType' | 'Role';
  /** AKJ číselná úroveň; AKJType resolved level (z WorldSettings.akjTypes); Role enum hodnota. */
  level?: number;
  /** Pouze pro AKJType — surový key (debug/fallback). */
  akjKey?: string;
  /** Pouze pro AKJType — lidský název z WorldSettings; pokud key chybí, fallback = key. */
  akjLabel?: string;
  /** Pouze pro Role — český label rolea. */
  roleLabel?: string;
}

/**
 * Krok 9.1 — label/value pár pro strukturovaná metadata postavy/NPC
 * (rasa, povolání, …). Public i private varianta.
 */
export interface InfoBlock {
  label: string;
  value: string;
}

export interface PageSection {
  id: string;
  title: string;
  content: string;
  order: number;
  isCollapsed: boolean;
  items: PageSectionItem[];
}

export interface PageSectionItem {
  id: string;
  text: string;
  quantity?: number;
  note?: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  caption?: string;
  order: number;
}

export interface InstructionalVideo {
  id: string;
  title: string;
  youtubeUrl: string;
  youtubeVideoId: string;
}

export interface MenuItem {
  label: string;
  href: string;
  order: number;
}

export interface PageTable {
  hasTable: boolean;
  title?: string;
  /**
   * Krok 8.5 — buňky tabulky (klíče i hodnoty) jsou rich-text HTML
   * stringy. Libovolný úsek textu může být inline odkaz (`<a href>`);
   * v jedné buňce klidně víc odkazů. `toEntity` normalizuje starší tvary
   * (krok 8.4 `{text,link}` objekty, prosté stringy).
   */
  headers?: string[];
  values?: string[];
}

export interface Page {
  id: string;
  slug: string;
  worldId: string;
  type: PageType;
  title: string;
  content: string;
  imageUrl?: string;
  bigImage?: boolean;
  table?: PageTable;
  sections: PageSection[];
  galleryImages: GalleryImage[];
  videos: InstructionalVideo[];
  menu: MenuItem[];
  plainText: string;
  isWoodWide: boolean;
  accessRequirements: AccessRequirement[];
  customData?: Record<string, string>;
  order: number;
  // Krok 9.1 — pole pro typ PostavaHrace/NPC. Pro ostatní typy zůstávají
  // undefined a service je do response nepřidává.
  /** PJ-only obsah (mirror character.privateBio). Service ho v response
   *  filtruje pro neoprávněné — vidí jen PJ + ownerUserId. */
  privateContent?: string;
  /** PJ-only strukturovaná metadata (rasa, povolání, …). Stejný permission
   *  filter jako privateContent. */
  privateInfoBlocks?: InfoBlock[];
  /** Pro type=PostavaHrace: přiřazený hráč (Character.userId equivalent). */
  ownerUserId?: string;
  /** Pro type ∈ {PostavaHrace, NPC}: odkaz na Character entity, která drží
   *  5 subdokumentů (diary/calendar/finance/inventory/notes). */
  characterRef?: { characterId: string };
  createdAt: Date;
  updatedAt: Date;
}
