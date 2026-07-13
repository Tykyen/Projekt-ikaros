import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/interfaces/user.interface';
import { assertCanChangeRole, assertCanModerate } from './hierarchy';

describe('hierarchy', () => {
  const sa = { id: 'sa', role: UserRole.Superadmin };
  const admin = { id: 'a', role: UserRole.Admin };
  const adminWithMod = {
    id: 'a',
    role: UserRole.Admin,
    adminPermissions: {
      canManageAdmins: false,
      canModerateContent: true,
    },
  };
  const hrac = { id: 'h', role: UserRole.Hrac };
  const otherAdmin = { id: 'a2', role: UserRole.Admin };

  describe('assertCanChangeRole', () => {
    it('Superadmin → změní kohokoli kromě sebe', () => {
      expect(() => assertCanChangeRole(sa, admin, UserRole.Hrac)).not.toThrow();
      expect(() => assertCanChangeRole(sa, hrac, UserRole.Admin)).not.toThrow();
    });

    it('Self-change → 403', () => {
      expect(() =>
        assertCanChangeRole(
          sa,
          { id: 'sa', role: UserRole.Superadmin },
          UserRole.Hrac,
        ),
      ).toThrow(ForbiddenException);
    });

    it('Same role no-op → pass', () => {
      expect(() =>
        assertCanChangeRole(admin, hrac, UserRole.Hrac),
      ).not.toThrow();
    });

    it('Admin → cannot change other admin', () => {
      expect(() =>
        assertCanChangeRole(admin, otherAdmin, UserRole.Hrac),
      ).toThrow(ForbiddenException);
    });

    it('Admin → cannot promote to admin', () => {
      expect(() => assertCanChangeRole(admin, hrac, UserRole.Admin)).toThrow(
        ForbiddenException,
      );
    });

    it('Hrac → cannot change anything', () => {
      expect(() =>
        assertCanChangeRole(hrac, otherAdmin, UserRole.Ikarus),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertCanModerate', () => {
    it('Superadmin BAN admin → OK', () => {
      expect(() => assertCanModerate(sa, admin, 'BAN')).not.toThrow();
    });

    it('Admin BAN Hrac → OK', () => {
      expect(() => assertCanModerate(admin, hrac, 'BAN')).not.toThrow();
    });

    it('Admin BAN other admin → 403', () => {
      expect(() => assertCanModerate(admin, otherAdmin, 'BAN')).toThrow(
        ForbiddenException,
      );
    });

    it('Admin DELETE bez canModerateContent → 403', () => {
      expect(() => assertCanModerate(admin, hrac, 'DELETE')).toThrow(
        ForbiddenException,
      );
    });

    it('Admin DELETE s canModerateContent → OK', () => {
      expect(() =>
        assertCanModerate(adminWithMod, hrac, 'DELETE'),
      ).not.toThrow();
    });

    it('Self-moderation → 403', () => {
      expect(() => assertCanModerate(admin, admin, 'BAN')).toThrow(
        ForbiddenException,
      );
    });
  });
});
