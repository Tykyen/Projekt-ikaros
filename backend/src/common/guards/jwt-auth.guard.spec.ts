import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockUpdateLastSeen = jest.fn().mockResolvedValue(undefined);
const mockFindById = jest.fn();
const mockRepo = {
  updateLastSeen: mockUpdateLastSeen,
  findById: mockFindById,
};

// 1.3c (N-6b) — gate reflector. Default: routa NENÍ @AllowPendingDeletion.
const mockGetAllAndOverride = jest.fn().mockReturnValue(false);
const mockReflector = {
  getAllAndOverride: mockGetAllAndOverride,
} as unknown as Reflector;

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function activeUser(extra: Record<string, unknown> = {}) {
  return { id: 'user123', isDeleted: false, ...extra };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(mockRepo as never, mockReflector);
    jest.clearAllMocks();
    mockGetAllAndOverride.mockReturnValue(false);
    mockFindById.mockResolvedValue(activeUser());
  });

  it('calls updateLastSeen with userId after successful JWT validation', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    const ctx = makeContext({ sub: 'user123' });

    await guard.canActivate(ctx);
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockFindById).toHaveBeenCalledWith('user123');
    expect(mockUpdateLastSeen).toHaveBeenCalledWith('user123');
  });

  it('does NOT call updateLastSeen when JWT validation fails', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockRejectedValue(new Error('Unauthorized'));
    const ctx = makeContext(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow('Unauthorized');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockUpdateLastSeen).not.toHaveBeenCalled();
  });

  it('error in updateLastSeen does not break the response', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    mockUpdateLastSeen.mockRejectedValueOnce(new Error('DB down'));
    const ctx = makeContext({ sub: 'user123' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
  });

  // ── 1.3c (N-6b) per-request account-state gate ──────────────────────

  it('throws DELETED when user no longer exists', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    mockFindById.mockResolvedValue(null);
    const ctx = makeContext({ sub: 'gone' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockUpdateLastSeen).not.toHaveBeenCalled();
  });

  it('throws DELETED when user.isDeleted', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    mockFindById.mockResolvedValue(activeUser({ isDeleted: true }));
    const ctx = makeContext({ sub: 'user123' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws DELETION_PENDING when deletionRequestedAt set (default route)', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    mockFindById.mockResolvedValue(
      activeUser({ deletionRequestedAt: new Date() }),
    );
    const ctx = makeContext({ sub: 'user123' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockUpdateLastSeen).not.toHaveBeenCalled();
  });

  it('allows pending-deletion user on @AllowPendingDeletion route', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    mockGetAllAndOverride.mockReturnValue(true);
    mockFindById.mockResolvedValue(
      activeUser({ deletionRequestedAt: new Date() }),
    );
    const ctx = makeContext({ sub: 'user123' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockUpdateLastSeen).toHaveBeenCalledWith('user123');
  });

  it('still throws DELETED on @AllowPendingDeletion route when isDeleted', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    mockGetAllAndOverride.mockReturnValue(true);
    mockFindById.mockResolvedValue(activeUser({ isDeleted: true }));
    const ctx = makeContext({ sub: 'user123' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
