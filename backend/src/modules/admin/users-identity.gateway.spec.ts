import { UsersIdentityGateway } from './users-identity.gateway';
import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

/** Mock Socket.IO serveru — zachytává `.to(room).emit(...)` a
 *  `.in(room).disconnectSockets(true)` (FIX-A část 2). */
function mockServer() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const disconnectSockets = jest.fn();
  const inFn = jest.fn(() => ({ disconnectSockets }));
  return {
    server: { to, in: inFn } as unknown as Server,
    to,
    emit,
    in: inFn,
    disconnectSockets,
  };
}

describe('UsersIdentityGateway', () => {
  let gateway: UsersIdentityGateway;
  let srv: ReturnType<typeof mockServer>;
  let jwtService: { verify: jest.Mock };

  beforeEach(() => {
    jwtService = { verify: jest.fn(() => ({ sub: 'u1' })) };
    gateway = new UsersIdentityGateway(jwtService as unknown as JwtService);
    srv = mockServer();
    gateway.server = srv.server;
  });

  it('handleConnection s validním tokenem joinne user: room', () => {
    const join = jest.fn();
    const client = {
      handshake: { auth: { token: 'tok' } },
      join,
    } as unknown as Socket;
    gateway.handleConnection(client);
    expect(join).toHaveBeenCalledWith('user:u1');
  });

  it('handleConnection bez tokenu nejoinne (tiše projde)', () => {
    const join = jest.fn();
    const client = {
      handshake: { auth: {} },
      join,
    } as unknown as Socket;
    gateway.handleConnection(client);
    expect(join).not.toHaveBeenCalled();
  });

  // FIX-A část 2 (2026-07) — ban/delete musí ukončit i JIŽ otevřený socket.
  it('kind:"ban" → emituje identity.changed A force-disconnectne user: room', () => {
    gateway.handleIdentityChanged({ userId: 'u9', kind: 'ban' });
    expect(srv.to).toHaveBeenCalledWith('user:u9');
    expect(srv.emit).toHaveBeenCalledWith('user:identity:changed', {
      kind: 'ban',
    });
    expect(srv.in).toHaveBeenCalledWith('user:u9');
    expect(srv.disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('kind:"deletion" → taky force-disconnectne (admin moderation delete)', () => {
    gateway.handleIdentityChanged({ userId: 'u9', kind: 'deletion' });
    expect(srv.in).toHaveBeenCalledWith('user:u9');
    expect(srv.disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('kind:"unban" → JEN refetch signál, žádný disconnect', () => {
    gateway.handleIdentityChanged({ userId: 'u9', kind: 'unban' });
    expect(srv.emit).toHaveBeenCalledWith('user:identity:changed', {
      kind: 'unban',
    });
    expect(srv.disconnectSockets).not.toHaveBeenCalled();
  });

  it('kind:"role" → JEN refetch signál, žádný disconnect', () => {
    gateway.handleIdentityChanged({ userId: 'u9', kind: 'role' });
    expect(srv.disconnectSockets).not.toHaveBeenCalled();
  });

  it('handleUsernameDecided emituje kind:"username", žádný disconnect', () => {
    gateway.handleUsernameDecided({ userId: 'u9', status: 'approved' });
    expect(srv.emit).toHaveBeenCalledWith('user:identity:changed', {
      kind: 'username',
    });
    expect(srv.disconnectSockets).not.toHaveBeenCalled();
  });
});
