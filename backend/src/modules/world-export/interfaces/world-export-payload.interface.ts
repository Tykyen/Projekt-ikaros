/**
 * 14.7c — Manifest balíku exportu světa (`manifest.json` v ZIP).
 *
 * `scope`:
 *  - `pj-full` = kompletní strom (PJ / platform Admin) — import-ready.
 *  - `viewer-partial` = oříznuto na to, co viewer vidí (zatím se nestaví; export
 *    pro ne-PJ vrací 403, viz plan-14.7c).
 *
 * `version` = verze schématu balíku → budoucí import migruje starší.
 */
export interface WorldExportManifest {
  version: string;
  scope: 'pj-full' | 'viewer-partial';
  exportedAt: string;
  worldId: string;
  worldSlug: string;
  hasChat: boolean;
  /** Počty entit per sekce (přehled v balíku, sanity pro budoucí round-trip). */
  counts: Record<string, number>;
}

export const WORLD_EXPORT_VERSION = '1.0';
