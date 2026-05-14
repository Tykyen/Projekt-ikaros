import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockUpdateLastSeen = jest.fn().mockResolvedValue(undefined);
const mockRepo = { updateLastSeen: mockUpdateLastSeen };

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(mockRepo as never);
    jest.clearAllMocks();
  });

  it('calls updateLastSeen with userId after successful JWT validation', async () => {
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    const ctx = makeContext({ sub: 'user123' });

    await guard.canActivate(ctx);
    await new Promise((resolve) => setImmediate(resolve));

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
});
