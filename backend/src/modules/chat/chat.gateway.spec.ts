import { ChatGateway } from './chat.gateway';
import { ChatPresenceService } from './chat-presence.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import type { ChatService } from './chat.service';
import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

/** Mock Socket.IO serveru — zachytává `.to(room).emit(event, payload)`. */
function mockServer() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { server: { to } as unknown as Server, to, emit };
}

const socket = (id: string) => ({ id }) as Socket;

describe('ChatGateway — presence (krok 6.1d)', () => {
  let gateway: ChatGateway;
  let presence: ChatPresenceService;
  let chatService: { resolveChannelPresenceRole: jest.Mock };
  let srv: ReturnType<typeof mockServer>;

  beforeEach(() => {
    presence = new ChatPresenceService();
    chatService = { resolveChannelPresenceRole: jest.fn() };
    const jwtService = {
      verify: jest.fn(() => ({ sub: 'u1' })),
    } as unknown as JwtService;
    gateway = new ChatGateway(
      chatService as unknown as ChatService,
      presence,
      jwtService,
    );
    srv = mockServer();
    gateway.server = srv.server;
  });

  it('handleConnection s validním tokenem joinne user: room + uloží ověřený userId', () => {
    const join = jest.fn();
    const data: Record<string, unknown> = {};
    const client = {
      handshake: { auth: { token: 'tok' } },
      data,
      join,
    } as unknown as Socket;
    gateway.handleConnection(client);
    expect(join).toHaveBeenCalledWith('user:u1');
    expect(data.userId).toBe('u1'); // N-9 — ověřený userId v socket.data
  });

  it('handleConnection bez tokenu nejoinne (jen tiše projde)', () => {
    const join = jest.fn();
    const client = {
      handshake: { auth: {} },
      data: {},
      join,
    } as unknown as Socket;
    gateway.handleConnection(client);
    expect(join).not.toHaveBeenCalled();
  });

  // N-9 — sound:play bere identitu z OVĚŘENÉHO socket.data, ne z payloadu.
  it('handleSoundPlay použije client.data.userId (ne payload) a ověří roli', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(WorldRole.PJ);
    const client = { data: { userId: 'realUser' } } as unknown as Socket;
    await gateway.handleSoundPlay(client, {
      channelId: 'ch1',
      youtubeUrl: 'yt',
      name: 'song',
    });
    // role se ověřuje proti ověřenému userId, ne proti nějakému payload.userId
    expect(chatService.resolveChannelPresenceRole).toHaveBeenCalledWith(
      'ch1',
      'realUser',
    );
    expect(srv.emit).toHaveBeenCalledWith(
      'chat:sound:playing',
      expect.objectContaining({ channelId: 'ch1' }),
    );
  });

  it('handleSoundPlay neautentizovaný socket (bez userId) → nic', async () => {
    const client = { data: {} } as unknown as Socket;
    await gateway.handleSoundPlay(client, {
      channelId: 'ch1',
      youtubeUrl: 'yt',
      name: 'song',
    });
    expect(chatService.resolveChannelPresenceRole).not.toHaveBeenCalled();
    expect(srv.emit).not.toHaveBeenCalled();
  });

  it('handleChannelJoin broadcastne příchod a uloží presence', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(5);
    await gateway.handleChannelJoin(
      { channelId: 'ch1', userId: 'u1', username: 'Aragorn' },
      socket('s1'),
    );
    expect(srv.to).toHaveBeenCalledWith('chat:ch1');
    expect(srv.emit).toHaveBeenCalledWith(
      'chat:presence',
      expect.objectContaining({ action: 'join', userId: 'u1', worldRole: 5 }),
    );
    expect(presence.list('ch1')).toHaveLength(1);
  });

  it('handleChannelJoin nic neudělá když uživatel není člen světa', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(null);
    await gateway.handleChannelJoin(
      { channelId: 'ch1', userId: 'u1', username: 'X' },
      socket('s1'),
    );
    expect(srv.emit).not.toHaveBeenCalled();
    expect(presence.list('ch1')).toHaveLength(0);
  });

  it('handleChannelJoin nebroadcastne podruhé (už přítomen jiným socketem)', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(2);
    await gateway.handleChannelJoin(
      { channelId: 'ch1', userId: 'u1', username: 'A' },
      socket('s1'),
    );
    srv.emit.mockClear();
    await gateway.handleChannelJoin(
      { channelId: 'ch1', userId: 'u1', username: 'A' },
      socket('s2'),
    );
    expect(srv.emit).not.toHaveBeenCalled();
  });

  it('handleChannelLeave broadcastne odchod', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(2);
    await gateway.handleChannelJoin(
      { channelId: 'ch1', userId: 'u1', username: 'A' },
      socket('s1'),
    );
    srv.emit.mockClear();
    gateway.handleChannelLeave({ channelId: 'ch1' }, socket('s1'));
    expect(srv.emit).toHaveBeenCalledWith(
      'chat:presence',
      expect.objectContaining({ action: 'leave', userId: 'u1' }),
    );
  });

  it('handleDisconnect odebere presence ze všech konverzací', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(2);
    await gateway.handleChannelJoin(
      { channelId: 'ch1', userId: 'u1', username: 'A' },
      socket('s1'),
    );
    await gateway.handleChannelJoin(
      { channelId: 'ch2', userId: 'u1', username: 'A' },
      socket('s1'),
    );
    srv.emit.mockClear();
    gateway.handleDisconnect(socket('s1'));
    expect(srv.emit).toHaveBeenCalledTimes(2);
    expect(presence.list('ch1')).toHaveLength(0);
    expect(presence.list('ch2')).toHaveLength(0);
  });
});
