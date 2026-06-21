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
}
