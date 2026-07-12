import { UserRole } from '../../modules/users/interfaces/user.interface';

export interface RequestUser {
  id: string;
  role: UserRole;
  username: string;
  /**
   * Světy, kde má platform Admin/Superadmin aktivní elevaci („nahození práv").
   * Plní JwtAuthGuard/OptionalJwtAuthGuard (jen pro role<=Admin). Bez elevace
   * admin nemá world bypass — viz `worldAdminBypass` a spec-world-admin-elevation.
   */
  elevatedWorldIds?: string[];
  /**
   * Spec 15.8 — host (anonym) z guest JWT bez DB účtu. `role` je
   * `UserRole.Guest` (sentinel). Hospoda handlery podle toho volí anon identitu;
   * GuestOrMemberGuard pustí guesta jen na Hospodu (jinde 403).
   */
  isGuest?: boolean;
  /**
   * SESS (pentest PT-35e) — verze access tokenu z `tv` claim. JwtAuthGuard ji
   * porovná s `user.tokenVersion` v DB; nesouhlas = 401 SESSION_REVOKED
   * (logout-all / změna hesla bumpne DB verzi → všechny staré access tokeny umřou).
   * undefined = starý token bez claimu → čte se jako 0.
   */
  tokenVersion?: number;
}
