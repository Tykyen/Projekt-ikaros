import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/interfaces/user.interface';
import type { AdminPermissions } from '../../users/interfaces/user.interface';

interface Actor {
  id: string;
  role: UserRole;
  adminPermissions?: AdminPermissions;
}

interface Target {
  id: string;
  role: UserRole;
}

export type ModerationAction = 'BAN' | 'UNBAN' | 'DELETE' | 'UNDELETE';

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  UserRole.Superadmin,
  UserRole.Admin,
]);

function isAdmin(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

function deny(message: string, code: string): never {
  throw new ForbiddenException({
    message,
    code,
  });
}

/**
 * Authorization pro update role uživatele.
 *
 * Pravidla:
 *  1. Self-change → deny (i Superadmin nesmí měnit svou roli).
 *  2. Same role (newRole === target.role) → no-op pass (idempotent).
 *  3. Superadmin smí kohokoli (kromě sebe).
 *  4. Admin nesmí měnit roli jiného admina, ani povýšit na admin role.
 *  5. Ostatní role → deny.
 */
export function assertCanChangeRole(
  actor: Actor,
  target: Target,
  newRole: UserRole,
): void {
  if (actor.id === target.id) {
    deny('Nelze měnit vlastní roli', 'SELF_MODIFICATION');
  }
  if (newRole === target.role) {
    return;
  }
  if (actor.role === UserRole.Superadmin) {
    return;
  }
  if (actor.role === UserRole.Admin) {
    if (isAdmin(target.role)) {
      deny('Admin nesmí měnit role jiných adminů', 'INSUFFICIENT_ROLE');
    }
    if (isAdmin(newRole)) {
      deny('Admin nesmí povyšovat na admin role', 'INSUFFICIENT_ROLE');
    }
    return;
  }
  deny('Nedostatečná oprávnění', 'INSUFFICIENT_ROLE');
}

/**
 * Authorization pro BAN / UNBAN / DELETE / UNDELETE.
 *
 * Pravidla:
 *  1. Self-action → deny.
 *  2. Superadmin smí cokoli (kromě sebe).
 *  3. Admin nesmí provádět akce nad jiným adminem. Pro DELETE/UNDELETE
 *     navíc vyžaduje `adminPermissions.canModerateContent`.
 *  4. Ostatní role → deny.
 */
export function assertCanModerate(
  actor: Actor,
  target: Target,
  action: ModerationAction,
): void {
  if (actor.id === target.id) {
    deny('Nelze provést akci nad sebou', 'SELF_MODIFICATION');
  }
  if (actor.role === UserRole.Superadmin) {
    return;
  }
  if (actor.role === UserRole.Admin) {
    if (isAdmin(target.role)) {
      deny(
        'Admin nesmí provádět tuto akci nad jiným adminem',
        'INSUFFICIENT_ROLE',
      );
    }
    if (action === 'DELETE' || action === 'UNDELETE') {
      if (!actor.adminPermissions?.canModerateContent) {
        deny(
          'Pro delete/undelete je nutné canModerateContent oprávnění',
          'MISSING_PERMISSION',
        );
      }
    }
    return;
  }
  deny('Nedostatečná oprávnění', 'INSUFFICIENT_ROLE');
}
