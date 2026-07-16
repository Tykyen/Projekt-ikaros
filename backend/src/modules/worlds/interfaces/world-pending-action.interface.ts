/**
 * 15.10 — položka world-scoped fronty „ke zpracování" (per svět, pro PJ/co-PJ).
 *
 * Multi-typ, ať fronta (zvoneček / drawer / stránka Hráči) i její FE renderer
 * unesou víc druhů podnětů: `access-request` (žádost o vstup, vč. „Chci hrát")
 * a `page-review` (15.11 — návrh obsahu hráče ke schválení PJ).
 */
export type WorldPendingActionType = 'access-request' | 'page-review';

export interface WorldPendingActionItem {
  type: WorldPendingActionType;
  /** ID podkladové entity (accessRequestId / u page-review slug stránky). */
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  /** Kdy podnět vznikl — ISO 8601. */
  createdAt: string;
  /**
   * 15.10 fáze C (var. A) — jméno navržené postavy, když žadatel zvolil „Chci
   * hrát". Přítomné → „chce hrát jako {name}"; jinak prostá žádost o vstup.
   */
  characterName?: string;
  /** 15.11 — u `page-review`: název + typ navržené stránky. */
  pageTitle?: string;
  pageType?: string;
  /** 15.11 — u `page-review`: slug pro odkaz na náhled stránky. */
  pageSlug?: string;
}
