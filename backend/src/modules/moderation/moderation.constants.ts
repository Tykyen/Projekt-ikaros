import { ModerationAction, ReportCategory } from './enums/moderation.enums';
import { UserRole } from '../users/interfaces/user.interface';

/**
 * Spec 20B R3 — „správci komunity". Content-level reviewer set (akce M0–M4).
 * SpravceClanku/Galerie/Diskuzi moderují GENERICKOU frontu, ne jen svou plochu.
 */
export const CONTENT_REVIEWER_ROLES: readonly UserRole[] = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceClanku,
  UserRole.SpravceGalerie,
  UserRole.SpravceDiskuzi,
];

/** Spec 20B R3 — account-level zásahy (M5–M7) + kategorie minor_safety jen Admin+. */
export const ACCOUNT_LEVEL_ROLES: readonly UserRole[] = [
  UserRole.Superadmin,
  UserRole.Admin,
];

/** M5–M7 = account-level akce (omezit/ukončit účet, eskalace). */
export const ACCOUNT_LEVEL_ACTIONS: readonly ModerationAction[] = [
  ModerationAction.RestrictAccount,
  ModerationAction.TerminateAccount,
  ModerationAction.EscalateExternal,
];

/**
 * Spec 20B čl. 17 — lidsky čitelné popisy akcí M0–M7 pro statement of reasons
 * (in-app oznámení autorovi). Autorovi se posílá typ akce slovně, ne kód M-x.
 */
export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  [ModerationAction.None]: 'Bez zásahu',
  [ModerationAction.Notice]: 'Upozornění',
  [ModerationAction.HidePart]: 'Skrytí části obsahu',
  [ModerationAction.HideTemp]: 'Dočasné skrytí obsahu',
  [ModerationAction.Remove]: 'Odstranění obsahu',
  [ModerationAction.RestrictAccount]: 'Omezení účtu',
  [ModerationAction.TerminateAccount]: 'Ukončení účtu',
  [ModerationAction.EscalateExternal]: 'Předání příslušnému orgánu',
};

export function isContentReviewer(role: UserRole): boolean {
  return CONTENT_REVIEWER_ROLES.includes(role);
}

export function isAccountLevelReviewer(role: UserRole): boolean {
  return ACCOUNT_LEVEL_ROLES.includes(role);
}

/**
 * Vyžaduje-li akce nebo kategorie account-level oprávnění (M5–M7 nebo
 * minor_safety), smí ji provést jen Superadmin/Admin.
 */
export function requiresAccountLevel(
  action: ModerationAction,
  category?: ReportCategory,
): boolean {
  return (
    ACCOUNT_LEVEL_ACTIONS.includes(action) ||
    category === ReportCategory.MinorSafety
  );
}
