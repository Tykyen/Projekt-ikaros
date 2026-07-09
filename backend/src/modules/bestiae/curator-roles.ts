import { UserRole } from '../users/interfaces/user.interface';

/**
 * 16.2b-2 — kdo smí kurátorovat komunitní bestiář: **správci diskusí + správci
 * článků + platform Admin/Superadmin** (rozhodnutí uživatele 2026-07-09).
 * Sdíleno mezi `BestiaeService` (schvalovací akce) a `CommunityBestieReviewProvider`
 * (viditelnost pending fronty). Vzor jako `REVIEWER_ROLES` ostatních providerů.
 */
export const CURATOR_ROLES: UserRole[] = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceDiskuzi,
  UserRole.SpravceClanku,
];

export function isBestieCurator(role: UserRole): boolean {
  return CURATOR_ROLES.includes(role);
}
