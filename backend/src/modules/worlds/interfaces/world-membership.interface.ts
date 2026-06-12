import type { PublicOwnerSummary } from './world.interface';

/**
 * D-053 (2026-05-13) — Renumber 0–5 + nová `Ctenar` + rename `Pending` → `Zadatel`.
 * Migration `migrate:d053` přemapuje historické DB hodnoty:
 * -1→0 (Pending→Zadatel), 0→2 (Hrac), 1→3 (Korektor), 2→4 (PomocnyPJ), 3→5 (PJ).
 * `Ctenar = 1` je nová role bez historické instance.
 */
export enum WorldRole {
  Zadatel = 0,
  Ctenar = 1,
  Hrac = 2,
  Korektor = 3,
  PomocnyPJ = 4,
  PJ = 5,
}

/** Krok 5.9 — uživatelské doladění vzhledu (jas / kontrast / síla pozadí). */
export interface WorldThemeAdjust {
  brightness?: number;
  contrast?: number;
  bgDim?: number;
}

export interface WorldMembership {
  id: string;
  userId: string;
  worldId: string;
  role: WorldRole;
  joinedAt: Date;
  avatarUrl?: string;
  characterPath?: string;
  group?: string;
  isFree?: boolean;
  akj: number;
  /** Krok 5.9 — per-uživatel per-svět doladění vzhledu (přístupnost). */
  themeAdjust?: WorldThemeAdjust;
  themeUserOverrides?: Record<string, string>;
  /** Krok 6.2f — per-svět barva textu zprávy v chatu (hex; null = dědit). */
  chatColor?: string | null;
  /** Krok 6.2f — per-svět font zprávy v chatu (klíč z CHAT_FONT_KEYS; null = dědit). */
  chatFont?: string | null;
  /** Krok 6.2f — per-svět velikost písma zprávy (klíč z CHAT_FONT_SIZE_KEYS; null = 1×). */
  chatFontSize?: string | null;
  /**
   * Krok 6.3e — per-svět volba skinu kostek per typ
   * (`{ default: 'core-obsidian', '1d20': 'elemental-flame' }`).
   * Klíč `default` = fallback pro všechny typy, které nemají explicitní volbu.
   * `null` = nikdy nenastaveno → FE použije `core-obsidian`.
   */
  diceSkinMapping?: Record<string, string> | null;
  /**
   * Krok 6.3 D-NEW-dice-jail — uvězněné skiny (skryté z hlavního gridu
   * skin pickeru). Bonusová memetic featura.
   */
  jailedDiceSkins?: string[];
  /**
   * 10.2-prep-1 — per-player scene assignment (taktická mapa).
   * `null`/undefined = hráč není přiřazený na žádnou scénu. PJ orchestruje
   * přes `member.assignToScene` ops v `worldOperations`. Persistentní napříč
   * session — hráč se vrací tam, kde byl.
   */
  currentSceneId?: string | null;
  /**
   * 6.7b — osobní pořadí kanálů (`groupId[]`) a konverzací (`groupId → channelId[]`)
   * v sidebaru chatu, per hráč. Chybí/prázdné = fallback na globální `order`.
   */
  chatGroupOrder?: string[];
  chatChannelOrder?: Record<string, string[]>;
  /** 6.7c — `groupId` kanálů, které má hráč ROZBALENÉ (default: vše sbalené). */
  chatExpandedGroups?: string[];
  /** D-032 — osobní pořadí připnutých konverzací (`channelId[]`), per svět. */
  chatPinnedOrder?: string[];
  /** Poslední otevřená konverzace (cross-device seed). `channelId`. */
  chatLastActiveChannelId?: string;
  /**
   * Krok 5.3 — public summary uživatele (username, avatar účtu). Populuje
   * `getMembers` přes `enrichMembers`. Smazaný účet → undefined.
   */
  user?: PublicOwnerSummary;
}
