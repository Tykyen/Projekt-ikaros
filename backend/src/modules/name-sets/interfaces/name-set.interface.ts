/**
 * 21.2a — Jmenné sady (komunitní knihovna pro Generátory). Entity rozhraní.
 *
 * Sada = národ/stát: mužská + ženská jména + příjmení (+ volitelná přízviska).
 * Generování probíhá ČISTĚ na FE (spec R3) — BE jen ukládá a servíruje sady.
 * Bez obrázků (žádný media cleanup). Vzor: plant.interface.ts.
 */
import { UserRole } from '../../users/interfaces/user.interface';

export const NAME_SET_CATEGORIES = ['morvol', 'svet', 'vlastni'] as const;
export type NameSetCategory = (typeof NAME_SET_CATEGORIES)[number];

/** V1 — pravidlo přechylování ženských příjmení (aplikuje FE za běhu). */
export const FEMALE_SURNAME_RULES = ['none', 'cs'] as const;
export type FemaleSurnameRule = (typeof FEMALE_SURNAME_RULES)[number];

/** V6 — volitelný demografický profil (elfí sada = elfí demografie potomků). */
export interface NameSetDemography {
  /** Násobek lidského dožití (elfové ~3×). Default 1. */
  lifespanMult?: number;
  /** Okno plodnosti matky (lidský default 16–45 řeší FE engine). */
  fertilityFrom?: number;
  fertilityTo?: number;
}

export interface NameSet {
  id: string;
  scope: 'community';
  name: string;
  category: NameSetCategory;
  /** Původ/jazyk sady (např. „turecká jména" u Orků). */
  description?: string;
  /** Poznámka k příjmením („nemá příjmení", „podle rodiče") — Ogerská, Saimatei. */
  surnameNote?: string;
  tags?: string[];
  maleNames: string[];
  femaleNames: string[];
  surnames: string[];
  /** V7 — přízviska („Hrbáč", „z Lipan"). */
  epithets: string[];
  /** V1 — přechylování ženských příjmení. */
  femaleSurnameRule: FemaleSurnameRule;
  /** V2 — seznamy seřazené dle reálné četnosti → FE smí nabídnout Zipf. */
  frequencySorted: boolean;
  demography?: NameSetDemography;
  status: 'draft' | 'approved';
  authorId: string;
  approvedAt?: Date | null;
  approvedBy?: string;
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Souhrn sady pro list (bez jmenných polí — ta dává až detail). */
export interface NameSetSummary extends Omit<
  NameSet,
  | 'scope'
  | 'maleNames'
  | 'femaleNames'
  | 'surnames'
  | 'epithets'
  | 'approvedAt'
  | 'approvedBy'
  | 'moderationHidden'
  | 'moderationHiddenReason'
> {
  counts: { male: number; female: number; surnames: number; epithets: number };
}

/** Zúžený přihlášený uživatel předávaný do service (z JWT). */
export interface CurrentUser {
  id: string;
  role: UserRole;
}
