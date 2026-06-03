import { FriendshipsGateway } from './friendships.gateway';
import type { UsersService } from '../users/users.service';
import type { Server } from 'socket.io';

function mockServer() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { server: { to } as unknown as Server, to, emit };
}

describe('FriendshipsGateway (N-4 — EventEmitter2 → Socket.IO most)', () => {
  let gateway: FriendshipsGateway;
  let srv: ReturnType<typeof mockServer>;
  const usersService = {
    publicProfile: jest.fn(),
  } as unknown as UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    (usersService.publicProfile as jest.Mock).mockResolvedValue({
      username: 'Aragorn',
    });
    gateway = new FriendshipsGateway(usersService);
    srv = mockServer();
    gateway.server = srv.server;
  });

  it('requested → friend:request:incoming na příjemce s username odesílatele', async () => {
    await gateway.onRequested({
      friendshipId: 'f1',
      requesterId: 'u1',
      recipientId: 'u2',
    });
    expect(srv.to).toHaveBeenCalledWith('user:u2');
    expect(srv.emit).toHaveBeenCalledWith('friend:request:incoming', {
      friendshipId: 'f1',
      from: { username: 'Aragorn' },
    });
  });

  it('accepted → friend:request:accepted na žadatele', async () => {
    await gateway.onAccepted({
      friendshipId: 'f1',
      requesterId: 'u1',
      recipientId: 'u2',
    });
    expect(srv.to).toHaveBeenCalledWith('user:u1');
    expect(srv.emit).toHaveBeenCalledWith('friend:request:accepted', {
      friendshipId: 'f1',
      by: { username: 'Aragorn' },
    });
  });

  it('rejected → friend:request:declined na žadatele', async () => {
    await gateway.onRejected({
      friendshipId: 'f1',
      requesterId: 'u1',
      recipientId: 'u2',
    });
    expect(srv.to).toHaveBeenCalledWith('user:u1');
    expect(srv.emit).toHaveBeenCalledWith(
      'friend:request:declined',
      expect.objectContaining({ friendshipId: 'f1' }),
    );
  });

  it('removed wasPending=true → friend:request:canceled na příjemce', () => {
    gateway.onRemoved({
      friendshipId: 'f1',
      requesterId: 'u1',
      recipientId: 'u2',
      wasPending: true,
    });
    expect(srv.to).toHaveBeenCalledWith('user:u2');
    expect(srv.emit).toHaveBeenCalledWith('friend:request:canceled', {
      friendshipId: 'f1',
    });
  });

  it('removed wasPending=false → friend:removed na oba účastníky', () => {
    gateway.onRemoved({
      friendshipId: 'f1',
      requesterId: 'u1',
      recipientId: 'u2',
      wasPending: false,
    });
    expect(srv.to).toHaveBeenCalledWith('user:u1');
    expect(srv.to).toHaveBeenCalledWith('user:u2');
    expect(srv.emit).toHaveBeenCalledWith('friend:removed', {
      friendshipId: 'f1',
    });
  });

  it('selhání publicProfile → fallback username, žádný throw', async () => {
    (usersService.publicProfile as jest.Mock).mockRejectedValue(
      new Error('not found'),
    );
    await expect(
      gateway.onRequested({
        friendshipId: 'f1',
        requesterId: 'ghost',
        recipientId: 'u2',
      }),
    ).resolves.toBeUndefined();
    expect(srv.emit).toHaveBeenCalledWith('friend:request:incoming', {
      friendshipId: 'f1',
      from: { username: 'Uživatel' },
    });
  });
});
