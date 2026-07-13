import { ChatGateway } from './chat.gateway';
import { ChatPresenceService } from './chat-presence.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import type { ChatService } from './chat.service';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

/** Mock Socket.IO serveru — zachytává `.to(room).emit(event, payload)` a
 *  `.in(room).socketsLeave(room2)` (FIX-44). */
function mockServer() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const socketsLeave = jest.fn();
  const inFn = jest.fn(() => ({ socketsLeave }));
  return {
    server: { to, in: inFn } as unknown as Server,
    to,
    emit,
    in: inFn,
    socketsLeave,
  };
}

// Socket po handleConnection nese ověřený `data.userId` (z JWT handshake).
const socket = (id: string, userId = 'u1') =>
  ({ id, data: { userId } }) as unknown as Socket;

describe('ChatGateway — presence (krok 6.1d)', () => {
  let gateway: ChatGateway;
  let presence: ChatPresenceService;
  let chatService: { resolveChannelPresenceRole: jest.Mock };
  let usersRepo: { findById: jest.Mock };
  let srv: ReturnType<typeof mockServer>;

  beforeEach(() => {
    presence = new ChatPresenceService();
    chatService = { resolveChannelPresenceRole: jest.fn() };
    // W-3 dokončení — username/avatar presence se dotahují z DB (server
    // identity); mock vrací deterministická data odvozená z userId.
    usersRepo = {
      findById: jest.fn((id: string) =>
        Promise.resolve({
          id,
          username: `${id}-server`,
          avatarUrl: `${id}.png`,
        }),
      ),
    };
    const jwtService = {
      verify: jest.fn(() => ({ sub: 'u1' })),
    } as unknown as JwtService;
    gateway = new ChatGateway(
      chatService as unknown as ChatService,
      presence,
      jwtService,
      usersRepo as unknown as IUsersRepository,
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

  it('handleChannelJoin broadcastne příchod a uloží presence (jméno/avatar z DB)', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(5);
    await gateway.handleChannelJoin({ channelId: 'ch1' }, socket('s1'));
    expect(srv.to).toHaveBeenCalledWith('chat:ch1');
    expect(srv.emit).toHaveBeenCalledWith(
      'chat:presence',
      expect.objectContaining({
        action: 'join',
        userId: 'u1',
        worldRole: 5,
        username: 'u1-server',
        avatarUrl: 'u1.png',
      }),
    );
    expect(presence.list('ch1')).toHaveLength(1);
  });

  it('W-3 — handleChannelJoin ignoruje payload.userId, identitu bere z JWT (client.data.userId)', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(5);
    // Útočník pošle cizí userId v payloadu, ale ověřený socket patří 'u1'.
    await gateway.handleChannelJoin(
      { channelId: 'ch1', userId: 'victim-id' } as { channelId: string },
      socket('s1', 'u1'),
    );
    // Role se resolvuje pro OVĚŘENÝ userId, ne pro podvržený payload.
    expect(chatService.resolveChannelPresenceRole).toHaveBeenCalledWith(
      'ch1',
      'u1',
    );
    // Presence broadcast nese ověřenou identitu, ne 'victim-id'.
    expect(srv.emit).toHaveBeenCalledWith(
      'chat:presence',
      expect.objectContaining({ action: 'join', userId: 'u1' }),
    );
  });

  it('W-3 dokončení — spoofnutý username/avatarUrl v payloadu se nepropíše (jde z DB)', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(5);
    await gateway.handleChannelJoin(
      {
        channelId: 'ch1',
        username: 'FakePJ',
        avatarUrl: 'fake.png',
      } as { channelId: string },
      socket('s1', 'u1'),
    );
    // Broadcast i uložená presence nesou serverovou identitu z usersRepo.
    expect(usersRepo.findById).toHaveBeenCalledWith('u1');
    expect(srv.emit).toHaveBeenCalledWith(
      'chat:presence',
      expect.objectContaining({ username: 'u1-server', avatarUrl: 'u1.png' }),
    );
    expect(srv.emit).not.toHaveBeenCalledWith(
      'chat:presence',
      expect.objectContaining({ username: 'FakePJ' }),
    );
    expect(presence.list('ch1')).toEqual([
      expect.objectContaining({ username: 'u1-server', avatarUrl: 'u1.png' }),
    ]);
  });

  it('W-3 dokončení — uživatel neexistující v DB se do presence nedostane', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(5);
    usersRepo.findById.mockResolvedValue(null);
    await gateway.handleChannelJoin({ channelId: 'ch1' }, socket('s1'));
    expect(srv.emit).not.toHaveBeenCalled();
    expect(presence.list('ch1')).toHaveLength(0);
  });

  it('W-3 — handleChannelJoin neudělá nic na neautentizovaném socketu (bez data.userId)', async () => {
    await gateway.handleChannelJoin({ channelId: 'ch1' }, {
      id: 's1',
      data: {},
    } as unknown as Socket);
    expect(chatService.resolveChannelPresenceRole).not.toHaveBeenCalled();
    expect(srv.emit).not.toHaveBeenCalled();
  });

  it('handleChannelJoin nic neudělá když uživatel není člen světa', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(null);
    await gateway.handleChannelJoin({ channelId: 'ch1' }, socket('s1'));
    expect(usersRepo.findById).not.toHaveBeenCalled();
    expect(srv.emit).not.toHaveBeenCalled();
    expect(presence.list('ch1')).toHaveLength(0);
  });

  it('handleChannelJoin nebroadcastne podruhé (už přítomen jiným socketem)', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(2);
    await gateway.handleChannelJoin({ channelId: 'ch1' }, socket('s1'));
    srv.emit.mockClear();
    await gateway.handleChannelJoin({ channelId: 'ch1' }, socket('s2'));
    expect(srv.emit).not.toHaveBeenCalled();
  });

  it('handleChannelLeave broadcastne odchod', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(2);
    await gateway.handleChannelJoin({ channelId: 'ch1' }, socket('s1'));
    srv.emit.mockClear();
    gateway.handleChannelLeave({ channelId: 'ch1' }, socket('s1'));
    expect(srv.emit).toHaveBeenCalledWith(
      'chat:presence',
      expect.objectContaining({ action: 'leave', userId: 'u1' }),
    );
  });

  it('handleDisconnect odebere presence ze všech konverzací', async () => {
    chatService.resolveChannelPresenceRole.mockResolvedValue(2);
    await gateway.handleChannelJoin({ channelId: 'ch1' }, socket('s1'));
    await gateway.handleChannelJoin({ channelId: 'ch2' }, socket('s1'));
    srv.emit.mockClear();
    gateway.handleDisconnect(socket('s1'));
    expect(srv.emit).toHaveBeenCalledTimes(2);
    expect(presence.list('ch1')).toHaveLength(0);
    expect(presence.list('ch2')).toHaveLength(0);
  });

  // FIX-44 — revokace přístupu ke kanálu za provozu.
  it('handleChannelMemberRevoked vyhodí odebraného uživatele z room `chat:{channelId}`', () => {
    gateway.handleChannelMemberRevoked({ channelId: 'ch1', userId: 'u9' });
    expect(srv.in).toHaveBeenCalledWith('user:u9');
    expect(srv.socketsLeave).toHaveBeenCalledWith('chat:ch1');
  });

  // FIX-B část 2 (2026-07) — reorder eventy dřív nesly plné `items:[{id,order}]`
  // (+ groupId) do `world:{id}` roomu bez membership joinu (N-8) → odhalovaly
  // existenci/strukturu i skrytých kanálů. FE (`WorldChatRoom.invalidateGroups`)
  // na payload nesahá, jen refetchne — takže leak-safe `{worldId}` je bezpečné.
  describe('reorder eventy — leak-safe payload', () => {
    it('chat.groups.reordered → emit JEN {worldId}, bez items', () => {
      gateway.handleGroupsReordered({
        worldId: 'w1',
        items: [{ id: 'g1', order: 1 }],
      });
      expect(srv.to).toHaveBeenCalledWith('world:w1');
      expect(srv.emit).toHaveBeenCalledWith('chat:groups:reordered', {
        worldId: 'w1',
      });
    });

    it('chat.channels.reordered → emit JEN {worldId}, bez items/groupId', () => {
      gateway.handleChannelsReordered({
        worldId: 'w1',
        groupId: 'g1',
        items: [{ id: 'c1', order: 1 }],
      });
      expect(srv.to).toHaveBeenCalledWith('world:w1');
      expect(srv.emit).toHaveBeenCalledWith('chat:channels:reordered', {
        worldId: 'w1',
      });
    });
  });
});
