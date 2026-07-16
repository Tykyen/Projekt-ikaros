export const PAGE_TYPES = {
  Lokace: 'Lokace',
  Noviny: 'Noviny',
  Seznam: 'Seznam',
  Galerie: 'Galerie',
  // „Zoom" = layout velkého zoomovatelného obrázku (dříve se jmenoval
  // „Rodokmen"; přejmenováno v 7.x). Legacy dokumenty s type='Rodokmen' BEZ
  // familyTree se čtou jako Zoom přes normalizePageType().
  Zoom: 'Zoom',
  // 17.7 — vizuální strom rodiny. Odlišen od legacy 'Rodokmen' přítomností
  // pole `familyTree` (viz normalizePageType).
  Rodokmen: 'Rodokmen',
  Obrazovka: 'Obrazovka',
  Ostatni: 'Ostatní',
  // 11.5 — wiki-like typy kampaňových subjektů (Pavučina). Chovají se jako
  // `Ostatní` — čistá Page BEZ Character subdocu (nejsou v auto-Character
  // whitelistu v pages.service). Umožňují „vyvolat"/materializovat frakce z Pavučiny.
  Frakce: 'Frakce',
  Organizace: 'Organizace',
  Stat: 'Stát',
  // Krok 9.1 — sjednocení Character → Page. PostavaHrace má `ownerUserId`,
  // NPC je bez. Subdokumenty (deník/finance/…) drží Character entita,
  // odkaz přes `characterRef.characterId`.
  PostavaHrace: 'Postava hráče',
  NPC: 'NPC',
} as const;

export type PageType = (typeof PAGE_TYPES)[keyof typeof PAGE_TYPES];

/**
 * 15.11 — typy stránek, které smí NAVRHOVAT hráč (role Hráč+) jako `pending`
 * (ke schválení PJ). Whitelist: NE Postava hráče (řeší 15.10 „Chci hrát"),
 * Noviny, Obrazovka ani systémové stránky.
 */
export const PLAYER_PROPOSABLE_PAGE_TYPES: readonly PageType[] = [
  PAGE_TYPES.NPC,
  PAGE_TYPES.Lokace,
  PAGE_TYPES.Ostatni,
  PAGE_TYPES.Seznam,
  PAGE_TYPES.Galerie,
  PAGE_TYPES.Rodokmen,
  // 11.5 — hráč smí navrhnout i kampaňové wiki typy (pending ke schválení PJ).
  PAGE_TYPES.Frakce,
  PAGE_TYPES.Organizace,
  PAGE_TYPES.Stat,
];

/**
 * Read-time normalizace typu stránky pro zpětnou kompatibilitu.
 *
 * Kolize názvu „Rodokmen": v 7.x byl starý typ „Rodokmen" (velký zoom obrázek)
 * přejmenován na „Zoom"; v 17.7 přibyl NOVÝ typ „Rodokmen" (strom rodiny). Oba
 * mají v DB `type:'Rodokmen'` → rozlišujeme podle pole `familyTree`:
 *   - legacy velký obrázek (BEZ familyTree) → 'Zoom'
 *   - nový strom rodiny (má familyTree) → 'Rodokmen'
 * `hasFamilyTree` proto musí volající předat (projektuje existenci pole).
 */
export function normalizePageType(
  raw: unknown,
  hasFamilyTree = false,
): PageType {
  if (raw === 'Rodokmen' && !hasFamilyTree) return PAGE_TYPES.Zoom;
  return raw as PageType;
}

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
  /** D-19.2 — velikost blobu `url` v bytech; staré položky nemají. */
  bytes?: number;
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

/**
 * 17.7 — uzel vizuálního rodokmenu. Volná data (jméno/foto/datum) + volitelný
 * odkaz na stránku postavy (`pageSlug`). Pozice `x,y` je ručně tažená / srovnaná
 * auto-layoutem. Datum je volný text („1502" i „3. 4. 1502").
 */
export interface FamilyPerson {
  id: string;
  name: string;
  sub?: string;
  born?: string;
  died?: string;
  imageUrl?: string;
  color?: string;
  pageSlug?: string;
  x: number;
  y: number;
}

/** 17.7 — svazek: partneři A(+B) a jejich potomci. `bId` prázdné = samoživitel. */
export interface FamilyUnion {
  id: string;
  aId: string;
  bId?: string;
  childIds: string[];
}

export interface FamilyTree {
  people: FamilyPerson[];
  unions: FamilyUnion[];
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

/**
 * AKJ chráněná záložka stránky. Zobrazí se v liště vedle Profil/Kalendář jen
 * tomu, kdo splní `access` (OR logika, stejná jako page-level accessRequirements).
 * Obsah dědí ze základní stránky; `contentOverride` je sparse — vyplněné pole
 * přepíše základ, prázdné dědí. Viz spec-akj-protected-tabs.md.
 */
export interface AkjTabContentOverride {
  imageUrl?: string;
  content?: string;
  /** Atributy & metadata (sidebar „boxy"). Záložka dědí ze základu, nebo přepíše. */
  table?: PageTable;
}

export interface AkjTab {
  id: string;
  name: string;
  order: number;
  /** Podmínky viditelnosti (OR). Clearance = { type:'AKJ', value }, konkrétní
   *  hráč = { type:'UserId' }, role práh = { type:'Role' }. Prázdné = jen PJ. */
  access: AccessRequirement[];
  /** Skryje záložku i vlastníkovi postavy (page.ownerUserId). Default/undefined
   *  = false = vlastník PC záložku vidí i bez explicitního grantu. Mimo PC
   *  (page bez ownerUserId) bez efektu. Viz spec-akj-owner-visibility. */
  ownerHidden?: boolean;
  contentOverride?: AkjTabContentOverride;
  /** Runtime-only (NEukládá se): vyhodnotí `filterAkjTabsForViewer` per viewer.
   *  false = viewer má přístup → plný obsah. true = vidí jen zamčenou záložku
   *  (jméno + úroveň, bez obsahu). Nedefinováno na write path. */
  locked?: boolean;
}

export interface Page {
  id: string;
  slug: string;
  worldId: string;
  type: PageType;
  title: string;
  content: string;
  /** Pravidlová kniha — taháková rekapitulace pro HUD „Rychlý přehled". */
  quickRef?: string;
  imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré dokumenty nemají. */
  imageBytes?: number;
  bigImage?: boolean;
  // Parita s GameEvent — výřez hlavního obrázku (focal point + zoom + fit).
  // null = default (focal 50/50, zoom 100, fit cover); řeší FE getImageStyle.
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  table?: PageTable;
  /** 17.7 — vizuální rodokmen. Přítomnost odlišuje nový typ „Rodokmen" od
   *  legacy (velký obrázek → Zoom). Viz normalizePageType. */
  familyTree?: FamilyTree;
  sections: PageSection[];
  galleryImages: GalleryImage[];
  videos: InstructionalVideo[];
  menu: MenuItem[];
  plainText: string;
  isWoodWide: boolean;
  /**
   * B4b (spec 20B) — true = stránka skryta moderací (akce M2/M3). Globální
   * zásah: nevidí ji ani PJ/členové světa, jen platform reviewer set. Read cesty
   * (findBySlug/findByWorld/findDirectory/findMeta/findRandom) ji vynechají.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  accessRequirements: AccessRequirement[];
  customData?: Record<string, string>;
  order: number;
  // Krok 9.1 — pole pro typ PostavaHrace/NPC. Pro ostatní typy zůstávají
  // undefined a service je do response nepřidává.
  /** Pro type=PostavaHrace: přiřazený hráč (Character.userId equivalent). */
  ownerUserId?: string;
  /** Pro type ∈ {PostavaHrace, NPC}: odkaz na Character entity, která drží
   *  5 subdokumentů (diary/calendar/finance/inventory/notes). */
  characterRef?: { characterId: string };
  /**
   * 15.11 — životní cyklus návrhu obsahu. `pending` = hráčem (role Hráč+)
   * navržená stránka čekající na schválení PJ; vidí ji jen autor (`proposedBy`)
   * + moderátor. `approved` / chybí = živá (default — legacy + PJ/staff tvorba).
   */
  pageStatus?: 'pending' | 'approved';
  /**
   * 15.11 — kdo návrh vytvořil (autor). Oddělené od `ownerUserId` (= vlastník
   * PC), aby pending NPC/Lokace neprosákly do „Tvé postavy". Řídí viditelnost
   * pending; po schválení zůstává jako informace „navrhl".
   */
  proposedBy?: string;
  /** AKJ chráněné záložky. BE je ve `findBySlug` filtruje — vrací jen ty,
   *  na které má viewer přístup (PJ/Admin vidí všechny). */
  akjTabs?: AkjTab[];
  createdAt: Date;
  updatedAt: Date;
}
