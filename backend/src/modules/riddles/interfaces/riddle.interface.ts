/**
 * 21.5d — Hádanky (komunitní katalog). Entity rozhraní (FE+BE shared).
 *
 * Nejjednodušší knihovna Společné tvorby: BEZ statblocků (hádanka je
 * systémově neutrální) a BEZ obchodu. Identita hádanky = zadání (`question`),
 * pole `name` záměrně není (spoiler/vymýšlení názvů — spec R4). Odpověď a
 * nápovědy skrývá FE za spoiler klik (spec R3). Jen `scope='community'`.
 */
import { UserRole } from '../../users/interfaces/user.interface';

/** Úroveň obtížnosti — povinná, hlavní filtr knihovny (spec R2). */
export const RIDDLE_DIFFICULTIES = [
  'lehka',
  'stredni',
  'tezka',
  'ultratezka',
] as const;
export type RiddleDifficulty = (typeof RIDDLE_DIFFICULTIES)[number];

export interface Riddle {
  id: string;
  scope: 'community';
  /** Zadání hádanky (identita, spec R4). */
  question: string;
  /** Odpověď — FE ji skrývá za spoiler. */
  answer: string;
  /** Postupné nápovědy (0–5). */
  hints: string[];
  difficulty: RiddleDifficulty;
  /** Původ („lidová", „antika — Homér", …). */
  origin?: string;
  /** Poznámka pro PJ / kontext (např. pověst o Homérovi). */
  description?: string;
  tags?: string[];
  imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré dokumenty nemají. */
  imageBytes?: number;
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  /** 'draft' = knihovna návrhů, 'approved' = schválená knihovna. */
  status: 'draft' | 'approved';
  authorId: string;
  approvedAt?: Date | null;
  approvedBy?: string;
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Komentář hádanky — JEDNA úroveň (žádné statblocky, spec R1). */
export interface RiddleComment {
  id: string;
  riddleId: string;
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
