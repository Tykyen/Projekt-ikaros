/**
 * 15.10 — položka world-scoped fronty „ke zpracování" (per svět, pro PJ/co-PJ).
 *
 * Multi-typ, ať fronta (zvoneček / drawer / stránka Hráči) i její FE renderer
 * unesou víc druhů podnětů. Zatím `access-request` (žádost o vstup); fáze C
 * přidá `character-request` (návrh postavy ke schválení) do stejného tvaru.
 */
export type WorldPendingActionType = 'access-request';

export interface WorldPendingActionItem {
  type: WorldPendingActionType;
  /** ID podkladové entity (accessRequestId). */
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
}
