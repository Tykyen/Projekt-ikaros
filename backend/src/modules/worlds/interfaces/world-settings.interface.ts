import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface AkjType {
  key: string;
  name: string;
  level: number;
}

export interface MenuTemplateItem {
  label: string;
  href: string;
  order?: number;
}

export interface MenuTemplate {
  name: string;
  items: MenuTemplateItem[];
}

export interface HeadlineNode {
  id: string;
  label: string;
  isGroup: boolean;
  to?: string;
  children?: HeadlineNode[];
}

/** 12.2 — „Last info" box: krátké oznámení PJ členům světa. `updatedAt` plní server. */
export interface LastInfo {
  text: string;
  visible: boolean;
  updatedAt: Date;
}

export interface WorldCurrencyItem {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

/** Side-task character-tab-visibility — IDs tabů na PostavaLayout kromě `profil`. */
export type CharacterTabId =
  | 'denik'
  | 'finance'
  | 'vybava'
  | 'kalendar'
  | 'poznamky';

export const CHARACTER_TAB_IDS: readonly CharacterTabId[] = [
  'denik',
  'finance',
  'vybava',
  'kalendar',
  'poznamky',
] as const;

/** Per-type whitelist viditelných tabů. `undefined` = výchozí (vše). */
export interface CharacterTabVisibility {
  PostavaHrace: CharacterTabId[];
  NPC: CharacterTabId[];
}

/**
 * 6.8 — PJ persona v chatu. Vedení (role ≥ PomocnyPJ) vystupuje pod jednotnou
 * identitou. `name=null` → label „PJ"; `avatarUrl=null` → fallback iniciála.
 */
export interface PjChatPersona {
  enabled: boolean;
  name: string | null;
  avatarUrl: string | null;
  /**
   * 6.8-followup — režim vystupování vedení v chatu/headeru.
   * `unified` = jednotná anonymní identita „PJ" (default, dnešní chování);
   * `individual` = každý PJ/Pomocný PJ vystupuje pod svou rolí + vlastním avatarem.
   */
  mode: 'unified' | 'individual';
}

/**
 * 15.4 (E) — výchozí nastavení map světa (PJ nastaví jednou; nová scéna je
 * zdědí, scéna pak může přepsat). Vše optional = bez nastavení → tvrdé defaulty
 * při seedu scény.
 */
export interface MapDefaults {
  gridType?: 'hex' | 'square' | 'none';
  size?: number;
  unitsPerCell?: number;
  unitLabel?: string;
  showScale?: boolean;
  showHpPc?: boolean;
  showHpNpc?: boolean;
  showHpBestie?: boolean;
  allowPlayerDrawing?: boolean;
}

/**
 * 16.1e — výchozí viditelnost HP v combat rosteru CHATU (per typ). Samostatné
 * od `MapDefaults` (chat ≠ mapa). Per-konverzace `ChatChannel.chatCombatConfig`
 * to může přebít; chybí-li obojí → `true` (viditelné).
 */
export interface ChatCombatDefaults {
  showHpPc?: boolean;
  showHpNpc?: boolean;
  showHpBestie?: boolean;
}

export interface WorldSettings {
  id: string;
  worldId: string;
  hiddenNavItems: string[];
  customGroups: string[];
  groupColors: Record<string, string>;
  /** Znak skupiny (emblém): název skupiny → url. Zrcadlí se do ikony chat kanálu. */
  groupImages: Record<string, string>;
  customHeadline: HeadlineNode[];
  currencies: WorldCurrencyItem[];
  hideDefaultWeather: boolean;
  akjTypes: AkjType[];
  menuTemplates: MenuTemplate[];
  diarySchema: SchemaBlock[];
  /** Side-task character-tab-visibility — pokud chybí, FE považuje vše za viditelné. */
  characterTabVisibility?: CharacterTabVisibility;
  /**
   * 9.3 — slug `WorldCalendarConfig` použitý pro datum událostí na časové ose.
   * `null` = fallback na první config (BC default). Žádný side-effect na
   * `world.defaultCalendarConfigSlug` (ten dál řídí ostatní moduly).
   */
  timelineCalendarSlug: string | null;
  /** 12.2 — „Last info" box (oznámení PJ). `null` = nenastaveno. */
  lastInfo?: LastInfo | null;
  /** 6.8 — PJ persona v chatu. `null` = nenastaveno (FE default). */
  pjChatPersona?: PjChatPersona | null;
  /** 15.4 (E) — výchozí nastavení map (seed nové scény). `null` = nenastaveno. */
  mapDefaults?: MapDefaults | null;
  /** 16.1e — výchozí viditelnost HP v combat rosteru chatu. `null` = nenastaveno (→ true). */
  chatCombatDefaults?: ChatCombatDefaults | null;
  /**
   * 9.4 dluh #1 — in-game date pro advance-day mechanism.
   * `null` = nezahájen herní čas (advance-day se inicializuje z `new Date()`).
   * Při custom kalendáři je to JS Date reprezentující epoch-offset (běžný JS Date,
   * advance přes month-aware logic, nikoli přes setDate).
   */
  currentInGameDate: Date | null;
  updatedAt: Date;
}
