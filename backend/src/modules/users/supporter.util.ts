import { UserRole } from './interfaces/user.interface';

/**
 * 19.4 (spec-19.4) — role, které mají výhody podporovatele automaticky
 * (tým platformy). Odpovídá „Podporovatelé jsou automaticky admini, superadmini
 * a správci" ze zadání, čteno správně: tým = podporovatel automaticky.
 */
const SUPPORTER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceClanku,
  UserRole.SpravceGalerie,
  UserRole.SpravceDiskuzi,
]);

/**
 * Efektivní podporovatel = má ENTITLEMENT na výhody (víc světů, prémiové kostky,
 * vězení) — ať už z ručně uděleného `isSupporter`, nebo protože je členem týmu
 * (role). Používá gating v worlds/chat.
 *
 * POZOR: pro VIZUÁLNÍ odznak platí JINÉ pravidlo (hvězda role > Ikaros odznak >
 * nic — viz FE `IdentityBadge`). Tenhle helper řeší jen entitlement, ne badge.
 */
export function isEffectiveSupporter(
  role: UserRole,
  isSupporter?: boolean,
): boolean {
  return !!isSupporter || SUPPORTER_ROLES.has(role);
}
