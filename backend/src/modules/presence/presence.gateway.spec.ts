import { PresenceGateway } from './presence.gateway';
import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

function mockServer() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { server: { to, emit } as unknown as Server, emit };
}

function mockClient(
  id: string,
  token: string | undefined,
  data: Record<string, unknown>,
) {
  return {
    id,
    handshake: { auth: token ? { token } : {} },
    data,
    emit: jest.fn(),
    broadcast: { emit: jest.fn() },
    setMaxListeners: jest.fn(),
  } as unknown as Socket;
}

describe('PresenceGateway (N-5 — presence přes Socket.IO)', () => {
  let gateway: PresenceGateway;
  let srv: ReturnType<typeof mockServer>;
  const jwt = { verify: jest.fn() } as unknown as JwtService;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new PresenceGateway(jwt);
    srv = mockServer();
    gateway.server = srv.server;
  });

  it('connect s platným tokenem → snapshot klientovi + broadcast online', () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const data: Record<string, unknown> = {};
    const client = mockClient('s1', 'tok', data);
    gateway.handleConnection(client);
    expect(data.presenceUserId).toBe('u1');
    expect(client.emit).toHaveBeenCalledWith('presence:snapshot', {
      entries: [{ userId: 'u1', status: 'online' }],
    });
    expect(client.broadcast.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'online',
    });
  });

  it('druhý socket téhož usera → žádný další broadcast online (multi-tab)', () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    gateway.handleConnection(mockClient('s1', 'tok', {}));
    const c2 = mockClient('s2', 'tok', {});
    gateway.handleConnection(c2);
    expect(c2.broadcast.emit).not.toHaveBeenCalled();
  });

  it('connect bez tokenu → nic neeviduje', () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('no token');
    });
    const data: Record<string, unknown> = {};
    const client = mockClient('s1', undefined, data);
    gateway.handleConnection(client);
    expect(data.presenceUserId).toBeUndefined();
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('idle → broadcast presence:update status=idle', () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const data: Record<string, unknown> = {};
    gateway.handleConnection(mockClient('s1', 'tok', data));
    gateway.onIdle({ data } as unknown as Socket);
    expect(srv.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'idle',
    });
  });

  it('active po idle → broadcast status=online', () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const data: Record<string, unknown> = {};
    gateway.handleConnection(mockClient('s1', 'tok', data));
    gateway.onIdle({ data } as unknown as Socket);
    jest.clearAllMocks();
    gateway.onActive({ data } as unknown as Socket);
    expect(srv.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'online',
    });
  });

  it('poslední socket disconnect → broadcast offline', () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const data: Record<string, unknown> = {};
    gateway.handleConnection(mockClient('s1', 'tok', data));
    gateway.handleDisconnect({ id: 's1', data } as unknown as Socket);
    expect(srv.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'offline',
    });
  });

  it('W-11 — multi-tab: idle až když VŠECHNY sockety idle; active z jednoho → online', () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const d1: Record<string, unknown> = {};
    const d2: Record<string, unknown> = {};
    gateway.handleConnection(mockClient('s1', 'tok', d1));
    gateway.handleConnection(mockClient('s2', 'tok', d2));
    jest.clearAllMocks();

    // První tab zahálí → uživatel JEŠTĚ není idle (druhý je aktivní).
    gateway.onIdle({ id: 's1', data: d1 } as unknown as Socket);
    expect(srv.emit).not.toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'idle',
    });

    // Druhý tab taky zahálí → teprve teď je uživatel idle.
    gateway.onIdle({ id: 's2', data: d2 } as unknown as Socket);
    expect(srv.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'idle',
    });

    // Aktivita v jednom tabu → uživatel zpět online.
    jest.clearAllMocks();
    gateway.onActive({ id: 's1', data: d1 } as unknown as Socket);
    expect(srv.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'online',
    });
  });
});
