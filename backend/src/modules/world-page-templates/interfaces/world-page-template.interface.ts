/**
 * Krok 8.1a — Per-svět šablony tabulky stránky.
 *
 * PJ světa si vytváří vlastní šablony (např. „Postava", „Stát"). Editor stránek
 * je nabízí jako horizontální stripe karet. Matrix svět dostává v seedu 6
 * výchozích šablon, ostatní světy startují prázdné.
 */
export interface WorldPageTemplate {
  id: string;
  worldId: string;
  /** URL-safe identifier, unique per world. */
  key: string;
  /** Lidsky čitelný název karty. */
  label: string;
  /** Hlavičky atributové tabulky aplikované při výběru šablony. */
  headers: string[];
  /** Volitelně předvyplněný `table.title` (např. „Profil státu"). */
  defaultTitle?: string;
  /**
   * 15.5 — obsahová osnova (sanitizovaný TipTap HTML). Vloží se do
   * `page.content` při zakládání stránky, jen pokud je content prázdný.
   */
  contentOutline?: string;
  /** Lucide-react ikona (jednoduchý slug). Fallback `FileText`. */
  icon?: string;
  /** Řazení v stripe karet (asc). */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Whitelist ikon dostupných v ikon-pickeru (musí korespondovat s FE). */
export const WORLD_PAGE_TEMPLATE_ICONS = [
  'FileText',
  'MapPin',
  'Users',
  'Sword',
  'Coins',
  'BookOpen',
  'Globe',
  'Building2',
  'Crown',
  'Network',
] as const;

export type WorldPageTemplateIcon = (typeof WORLD_PAGE_TEMPLATE_ICONS)[number];
