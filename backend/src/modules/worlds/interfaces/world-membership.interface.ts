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
}
