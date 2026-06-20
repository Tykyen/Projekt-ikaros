import { PresenceGateway } from './presence.gateway';
import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

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
  // W-RUN-01 — default viditelný (hiddenPresence:false).
  const usersRepo = {
    findById: jest.fn().mockResolvedValue({ hiddenPresence: false }),
  } as unknown as IUsersRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    (usersRepo.findById as jest.Mock).mockResolvedValue({
      hiddenPresence: false,
    });
    gateway = new PresenceGateway(jwt, usersRepo);
    srv = mockServer();
    gateway.server = srv.server;
  });

  it('connect s platným tokenem → snapshot klientovi + broadcast online', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const data: Record<string, unknown> = {};
    const client = mockClient('s1', 'tok', data);
    await gateway.handleConnection(client);
    expect(data.presenceUserId).toBe('u1');
    expect(client.emit).toHaveBeenCalledWith('presence:snapshot', {
      entries: [{ userId: 'u1', status: 'online' }],
    });
    expect(client.broadcast.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'online',
    });
  });

  it('druhý socket téhož usera → žádný další broadcast online (multi-tab)', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    await gateway.handleConnection(mockClient('s1', 'tok', {}));
    const c2 = mockClient('s2', 'tok', {});
    await gateway.handleConnection(c2);
    expect(c2.broadcast.emit).not.toHaveBeenCalled();
  });

  it('connect bez tokenu → nic neeviduje', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('no token');
    });
    const data: Record<string, unknown> = {};
    const client = mockClient('s1', undefined, data);
    await gateway.handleConnection(client);
    expect(data.presenceUserId).toBeUndefined();
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('idle → broadcast presence:update status=idle', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const data: Record<string, unknown> = {};
    await gateway.handleConnection(mockClient('s1', 'tok', data));
    gateway.onIdle({ data } as unknown as Socket);
    expect(srv.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'idle',
    });
  });

  it('active po idle → broadcast status=online', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const data: Record<string, unknown> = {};
    await gateway.handleConnection(mockClient('s1', 'tok', data));
    gateway.onIdle({ data } as unknown as Socket);
    jest.clearAllMocks();
    gateway.onActive({ data } as unknown as Socket);
    expect(srv.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'online',
    });
  });

  it('poslední socket disconnect → broadcast offline', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const data: Record<string, unknown> = {};
    await gateway.handleConnection(mockClient('s1', 'tok', data));
    gateway.handleDisconnect({ id: 's1', data } as unknown as Socket);
    expect(srv.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      status: 'offline',
    });
  });

  it('W-11 — multi-tab: idle až když VŠECHNY sockety idle; active z jednoho → online', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
    const d1: Record<string, unknown> = {};
    const d2: Record<string, unknown> = {};
    await gateway.handleConnection(mockClient('s1', 'tok', d1));
    await gateway.handleConnection(mockClient('s2', 'tok', d2));
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

  // W-RUN-01 (plný audit 2026-06-20) — neviditelný mód.
  describe('hiddenPresence (W-RUN-01)', () => {
    it('skrytý uživatel: žádný broadcast online ostatním', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'hidden1' });
      (usersRepo.findById as jest.Mock).mockResolvedValue({
        hiddenPresence: true,
      });
      const client = mockClient('s1', 'tok', {});
      await gateway.handleConnection(client);
      expect(client.broadcast.emit).not.toHaveBeenCalled();
      // sám sebe ve snapshotu vidí
      expect(client.emit).toHaveBeenCalledWith('presence:snapshot', {
        entries: [{ userId: 'hidden1', status: 'online' }],
      });
    });

    it('skrytý uživatel se NEukáže v snapshotu ostatním', async () => {
      // skrytý se připojí první
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'hidden1' });
      (usersRepo.findById as jest.Mock).mockResolvedValue({
        hiddenPresence: true,
      });
      await gateway.handleConnection(mockClient('s1', 'tok', {}));
      // viditelný se připojí druhý → jeho snapshot nesmí obsahovat hidden1
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'visible1' });
      (usersRepo.findById as jest.Mock).mockResolvedValue({
        hiddenPresence: false,
      });
      const visible = mockClient('s2', 'tok', {});
      await gateway.handleConnection(visible);
      expect(visible.emit).toHaveBeenCalledWith('presence:snapshot', {
        entries: [{ userId: 'visible1', status: 'online' }],
      });
    });

    it('skrytý uživatel disconnect: žádný broadcast offline', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'hidden1' });
      (usersRepo.findById as jest.Mock).mockResolvedValue({
        hiddenPresence: true,
      });
      const data: Record<string, unknown> = {};
      await gateway.handleConnection(mockClient('s1', 'tok', data));
      jest.clearAllMocks();
      gateway.handleDisconnect({ id: 's1', data } as unknown as Socket);
      expect(srv.emit).not.toHaveBeenCalled();
    });

    it('fail-safe: chyba DB → uživatel viditelný (default)', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'u1' });
      (usersRepo.findById as jest.Mock).mockRejectedValue(new Error('db down'));
      const client = mockClient('s1', 'tok', {});
      await gateway.handleConnection(client);
      expect(client.broadcast.emit).toHaveBeenCalledWith('presence:update', {
        userId: 'u1',
        status: 'online',
      });
    });
  });
});
