import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { UserRole } from '../../modules/users/interfaces/user.interface';

const makeContext = (role: UserRole) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'u1', role } }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('should allow Superadmin (role=1)', () => {
    expect(guard.canActivate(makeContext(UserRole.Superadmin))).toBe(true);
  });

  it('should allow Admin (role=2)', () => {
    expect(guard.canActivate(makeContext(UserRole.Admin))).toBe(true);
  });

  it('should deny PJ (role=3)', () => {
    expect(() => guard.canActivate(makeContext(UserRole.PJ))).toThrow(ForbiddenException);
  });

  it('should deny Hrac (role=5)', () => {
    expect(() => guard.canActivate(makeContext(UserRole.Hrac))).toThrow(ForbiddenException);
  });
});
