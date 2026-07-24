/**
 * Spec 25.1 — doménové entity modulu `bug-reports` (odděleno od Mongoose schémat,
 * pattern jako moderation). Repozitář vrací tyto typy.
 *
 * Bug ≠ obsahová moderace: technická vada, ne UGC. Vlastní lifecycle (new→resolved),
 * bez kategorií/appelací. Kanál = Vypravěč (persona `speaker`).
 */

export type BugReportStatus = 'new' | 'resolved';

/** Auto-kontext posílá FE. `url` je BEZ query stringu (PII/GDPR — viz spec §8). */
export interface BugReportContext {
  /** Route pattern (např. /svet/:worldSlug/takticka-mapa) — kde uživatel byl. */
  route?: string;
  /** location.origin + pathname (bez query). */
  url: string;
  scope: 'ikaros' | 'world';
  /** Kdo byl „na řadě" (persona Vypravěče): Ishida / Joe / Měďák. */
  speaker: 'ikaros' | 'world' | 'tm';
  worldId?: string;
  buildVersion?: string;
  userAgent?: string;
}

/** Kolekce `bug_reports` — hlášení chyby. Nemaže se (audit stopa). */
export interface BugReport {
  id: string;
  text: string;
  /** Nepovinný — reporter chce vědět, jak to dopadlo (i anonym). */
  email?: string;
  context: BugReportContext;
  /** Z JWT, když přihlášen; nevyplněno u anonyma. NIKDY z body (anti-spoofing). */
  reporterId?: string;
  status: BugReportStatus;
  createdAtUtc: Date;
  resolvedByUserId?: string;
  resolvedAtUtc?: Date;
}
