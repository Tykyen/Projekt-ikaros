import { UserRole } from '../../modules/users/interfaces/user.interface';

/**
 * Elevation (R-20 nahození práv) — platform Admin/Superadmin má bypass ve světě
 * JEN když si pro daný svět vědomě aktivoval elevaci. De-elevated admin = žádný
 * world bypass (chová se podle své world membership role / jako nečlen).
 *
 * `elevatedWorldIds` plní JwtAuthGuard/OptionalJwtAuthGuard (jen pro role<=Admin).
 * Spec: docs/arch/phase-1/_side-tasks/spec-world-admin-elevation.md.
 */
export function worldAdminBypass(
  user:
    | { role?: UserRole | null; elevatedWorldIds?: string[] }
    | null
    | undefined,
  worldId: string,
): boolean {
  if (!user || user.role == null) return false;
  return (
    user.role <= UserRole.Admin && !!user.elevatedWorldIds?.includes(worldId)
  );
}
