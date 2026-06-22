import { ExecutionContext } from '@nestjs/common';
import { GuestOrMemberGuard } from './guest-or-member.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from '../../modules/auth/strategies/jwt.strategy';
import { UserRole } from '../../modules/users/interfaces/user.interface';
import type { ConfigService } from '@nestjs/config';

function ctxWith(user: Record<string, unknown>): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('GuestOrMemberGuard', () => {
  let guard: GuestOrMemberGuard;
  // Deps JwtAuthGuard — v testu je nevyužijeme (super je spy).
  const usersRepo = {} as never;
  const reflector = {} as never;
  const elevation = {} as never;

  // Passport canActivate žije na grandparentu (AuthGuard('jwt')).
  const passportProto = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: (ctx: ExecutionContext) => Promise<boolean> | boolean;
  };

  beforeEach(() => {
    guard = new GuestOrMemberGuard(usersRepo, reflector, elevation);
  });

  afterEach(() => jest.restoreAllMocks());

  it('host (guest) → projde, member gate (super) se NEvolá', async () => {
    jest.spyOn(passportProto, 'canActivate').mockResolvedValue(true);
    const superSpy = jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockResolvedValue(true);
    const ctx = ctxWith({
      id: 'anon_1',
      username: 'anonym1234',
      isGuest: true,
    });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('člen → deleguje na JwtAuthGuard member gate (super)', async () => {
    jest.spyOn(passportProto, 'canActivate').mockResolvedValue(true);
    const superSpy = jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockResolvedValue(true);
    const ctx = ctxWith({ id: 'u1', username: 'gandalf', role: UserRole.Hrac });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(superSpy).toHaveBeenCalled();
  });

  it('neplatný token (passport false) → 401 (false), super se NEvolá', async () => {
    jest.spyOn(passportProto, 'canActivate').mockResolvedValue(false);
    const superSpy = jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockResolvedValue(true);
    const ctx = ctxWith({});

    expect(await guard.canActivate(ctx)).toBe(false);
    expect(superSpy).not.toHaveBeenCalled();
  });
});

describe('JwtStrategy.validate — guest větev (15.8)', () => {
  const strategy = new JwtStrategy({
    get: () => 'test-secret',
  } as unknown as ConfigService);

  it('guest token → isGuest + role Guest, bez email/role z payloadu', () => {
    const out = strategy.validate({
      sub: 'anon_1',
      username: 'anonym1234',
      guest: true,
    }) as Record<string, unknown>;
    expect(out).toEqual({
      id: 'anon_1',
      username: 'anonym1234',
      role: UserRole.Guest,
      isGuest: true,
    });
  });

  it('member token → standardní RequestUser (role z payloadu)', () => {
    const out = strategy.validate({
      sub: 'u1',
      username: 'gandalf',
      role: UserRole.Hrac,
      email: 'a@b.c',
    }) as Record<string, unknown>;
    expect(out.id).toBe('u1');
    expect(out.role).toBe(UserRole.Hrac);
    expect(out.isGuest).toBeUndefined();
  });
});
