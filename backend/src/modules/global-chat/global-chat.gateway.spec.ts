import { GlobalChatGateway } from './global-chat.gateway';
import type { GlobalChatService } from './global-chat.service';
import type { UsersService } from '../users/users.service';
import type { Server, Socket } from 'socket.io';

/**
 * Mock socket — `id`, `data.userId` (W-10: identita z ověřeného JWT handshake,
 * ChatGateway ji nastavuje; presence join ji bere odtud, ne z payloadu),
 * `join`, `leave`, `to().emit()`. Default `userId` páruje konvenci `s{n}`→`u{n}`.
 */
const mockSocket = (id: string, userId = id.replace(/^s/, 'u')): Socket => {
  const emit = jest.fn();
  return {
    id,
    data: { userId },
    join: jest.fn(),
    leave: jest.fn(),
    // client.emit (targeted, 16.6 startHere joinerovi) i to().emit sdílí mock.
    emit,
    to: jest.fn(() => ({ emit })),
  } as unknown as Socket;
};

/** registerPresence dotahuje data postavy async — počká na mikrotasky.
 *  `Promise.resolve()` se nemockuje ani pod `jest.useFakeTimers()`. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('GlobalChatGateway', () => {
  let gateway: GlobalChatGateway;
  let service: jest.Mocked<
    Pick<
      GlobalChatService,
      | 'getChannelId'
      | 'saveSystemMessage'
      | 'toggleReaction'
      | 'sendWhisper'
      | 'getRoomDefault'
      | 'randomPlaceId'
    >
  >;
  let users: jest.Mocked<Pick<UsersService, 'findById'>>;
  let emit: jest.Mock;

  beforeEach(() => {
    service = {
      getChannelId: jest.fn((room) => `${room}-id`),
      saveSystemMessage: jest.fn().mockResolvedValue(undefined),
      toggleReaction: jest.fn().mockResolvedValue(undefined),
      sendWhisper: jest.fn().mockResolvedValue(undefined),
      getRoomDefault: jest.fn().mockResolvedValue('scifi'),
      randomPlaceId: jest.fn().mockReturnValue('13'),
    };
    // W-10 dokončení — username presence jde z DB profilu (ne z payloadu);
    // default mock vrací deterministické jméno odvozené z userId.
    users = {
      findById: jest.fn((id: string) =>
        Promise.resolve({ username: `jmeno-${id}` } as Awaited<
          ReturnType<UsersService['findById']>
        >),
      ),
    };
    gateway = new GlobalChatGateway(
      service as unknown as GlobalChatService,
      users as unknown as UsersService,
    );
    emit = jest.fn();
    gateway.server = {
      to: jest.fn(() => ({ emit })),
      emit: jest.fn(),
    } as unknown as Server;
  });

  describe('W-10 — identita presence z JWT + DB, ne z payloadu', () => {
    it('joinne ověřený user:{id} room; payload se už vůbec nečte', async () => {
      const sock = mockSocket('s1', 'u1');
      gateway.handleHospodaJoin(sock);
      await flush();
      // Socket joinne SVŮJ ověřený room (z client.data, ne z payloadu).
      expect(sock.join).toHaveBeenCalledWith('user:u1');
      // Jméno z DB profilu (server identity).
      expect(users.findById).toHaveBeenCalledWith('u1');
      expect(gateway.getPresence('hospoda')).toEqual([
        { userId: 'u1', username: 'jmeno-u1' },
      ]);
    });

    it('W-10 dokončení — spoofnutý username v room join payloadu se nepropíše', async () => {
      const sock = mockSocket('s1', 'u1');
      // Útočník pošle cizí jméno v payloadu — handler čte jen `room`.
      gateway.handleRoomJoin(
        { room: 'camp-1', username: 'FakeAdmin', userId: 'victim' } as {
          room: string;
        },
        sock,
      );
      await flush();
      expect(gateway.getPresence('camp-1')).toEqual([
        { userId: 'u1', username: 'jmeno-u1' },
      ]);
    });

    it('neautentizovaný socket (bez data.userId) se nezaregistruje', async () => {
      const sock = { id: 's1', data: {}, join: jest.fn() } as unknown as Socket;
      gateway.handleHospodaJoin(sock);
      await flush();
      expect(sock.join).not.toHaveBeenCalled();
      expect(gateway.getPresence('hospoda')).toEqual([]);
    });
  });

  describe('15.8 — host (guest) presence', () => {
    const guestSock = (id: string, anonId: string, anonName: string) =>
      ({
        id,
        data: { userId: anonId, isGuest: true, anonName },
        join: jest.fn(),
        emit: jest.fn(),
      }) as unknown as Socket;

    it('host: jméno z tokenu (anonName), bez DB profilu, bez avataru', async () => {
      const sock = guestSock('sg', 'anon_1', 'anonym1234');
      gateway.handleHospodaJoin(sock);
      await flush();
      expect(users.findById).not.toHaveBeenCalled();
      expect(gateway.getPresence('hospoda')).toEqual([
        { userId: 'anon_1', username: 'anonym1234' },
      ]);
    });

    it('host nemůže joinnout Camp (scope — jen Hospoda)', async () => {
      const sock = guestSock('sg2', 'anon_2', 'anonym5678');
      gateway.handleRoomJoin({ room: 'camp-1' }, sock);
      await flush();
      expect(gateway.getPresence('camp-1')).toEqual([]);
    });
  });

  describe('presence — multi-room (krok 4.2d §1)', () => {
    it('isolates presence between rooms', async () => {
      gateway.handleRoomJoin({ room: 'camp-1' }, mockSocket('s1'));
      gateway.handleRoomJoin({ room: 'camp-2' }, mockSocket('s2'));
      await flush();

      expect(gateway.getPresence('camp-1')).toEqual([
        { userId: 'u1', username: 'jmeno-u1' },
      ]);
      expect(gateway.getPresence('camp-2')).toEqual([
        { userId: 'u2', username: 'jmeno-u2' },
      ]);
      expect(gateway.getPresence('hospoda')).toEqual([]);
    });

    it('ignores join with an unknown room key', async () => {
      gateway.handleRoomJoin({ room: 'camp-9' }, mockSocket('s9'));
      await flush();
      expect(gateway.getPresence('camp-1')).toEqual([]);
    });

    it('one socket can be present in several rooms at once', async () => {
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      await flush();
      gateway.handleRoomJoin({ room: 'camp-1' }, sock);
      await flush();

      expect(gateway.getPresence('hospoda')).toHaveLength(1);
      expect(gateway.getPresence('camp-1')).toHaveLength(1);
    });

    it('leave removes the socket from one room only', async () => {
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      gateway.handleRoomJoin({ room: 'camp-1' }, sock);
      await flush();

      gateway.handleRoomLeave({ room: 'camp-1' }, sock);
      expect(gateway.getPresence('camp-1')).toEqual([]);
      expect(gateway.getPresence('hospoda')).toHaveLength(1);

      gateway.handleHospodaLeave(sock);
      expect(gateway.getPresence('hospoda')).toEqual([]);
    });

    it('deduplicates presence by userId across multiple sockets', async () => {
      // Jeden uživatel (u1) na dvou tabech → ověřený userId stejný pro oba.
      gateway.handleHospodaJoin(mockSocket('s1', 'u1'));
      gateway.handleHospodaJoin(mockSocket('s2', 'u1'));
      await flush();
      expect(gateway.getPresence('hospoda')).toHaveLength(1);
      expect(gateway.getRoomCounts().hospoda).toBe(1);
    });

    it('handleDisconnect removes the socket from all its rooms', async () => {
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      gateway.handleRoomJoin({ room: 'camp-1' }, sock);
      await flush();
      expect(gateway.getRoomCounts()).toEqual({
        hospoda: 1,
        'camp-1': 1,
        'camp-2': 0,
        'camp-3': 0,
        'voice-krcma': 0,
      });

      gateway.handleDisconnect(sock);
      expect(gateway.getPresence('hospoda')).toEqual([]);
      expect(gateway.getPresence('camp-1')).toEqual([]);
      expect(gateway.getRoomCounts()).toEqual({
        hospoda: 0,
        'camp-1': 0,
        'camp-2': 0,
        'camp-3': 0,
        'voice-krcma': 0,
      });
    });
  });

  describe('character data v presence (krok 4.2d §8)', () => {
    it('presence nese username/characterName/characterAvatarUrl z profilu', async () => {
      users.findById.mockResolvedValue({
        username: 'tyky',
        characterName: 'Aragorn',
        characterAvatarUrl: 'aragorn.png',
      } as Awaited<ReturnType<UsersService['findById']>>);
      gateway.handleRoomJoin({ room: 'camp-1' }, mockSocket('s1'));
      await flush();
      expect(gateway.getPresence('camp-1')).toEqual([
        {
          userId: 'u1',
          username: 'tyky',
          characterName: 'Aragorn',
          characterAvatarUrl: 'aragorn.png',
        },
      ]);
    });
  });

  describe('17.6 — voice presence (Voice krčma)', () => {
    it('voice:join přidá uživatele do rosteru a broadcastne chat:voice:presence', async () => {
      users.findById.mockResolvedValue({ username: 'Tyky' } as Awaited<
        ReturnType<UsersService['findById']>
      >);
      const sock = mockSocket('s1', 'u1');
      // Realisticky: FE nejdřív joinne místnost (naplní presence jméno), pak hovor.
      gateway.handleRoomJoin({ room: 'voice-krcma' }, sock);
      await flush();
      gateway.handleVoiceJoin({ room: 'voice-krcma' }, sock);
      expect(gateway.getVoiceRoster('voice-krcma')).toEqual([
        {
          userId: 'u1',
          username: 'Tyky',
          avatarUrl: undefined,
          muted: false,
          cam: false,
        },
      ]);
      expect(gateway.server.to).toHaveBeenCalledWith('chat:voice-krcma-id');
      expect(emit).toHaveBeenCalledWith('chat:voice:presence', {
        room: 'voice-krcma',
        roster: [
          {
            userId: 'u1',
            username: 'Tyky',
            avatarUrl: undefined,
            muted: false,
            cam: false,
          },
        ],
      });
    });

    it('voice:leave odebere uživatele z rosteru', () => {
      const sock = mockSocket('s1', 'u1');
      gateway.handleVoiceJoin({ room: 'voice-krcma' }, sock);
      expect(gateway.getVoiceRoster('voice-krcma')).toHaveLength(1);
      gateway.handleVoiceLeave({ room: 'voice-krcma' }, sock);
      expect(gateway.getVoiceRoster('voice-krcma')).toEqual([]);
    });

    it('voice:state změní muted/cam a broadcastne chat:voice:state', () => {
      const sock = mockSocket('s1', 'u1');
      gateway.handleVoiceJoin({ room: 'voice-krcma' }, sock);
      gateway.handleVoiceState(
        { room: 'voice-krcma', muted: true, cam: true },
        sock,
      );
      expect(gateway.getVoiceRoster('voice-krcma')[0]).toMatchObject({
        muted: true,
        cam: true,
      });
      expect(emit).toHaveBeenCalledWith('chat:voice:state', {
        room: 'voice-krcma',
        userId: 'u1',
        muted: true,
        cam: true,
      });
    });

    it('multi-tab: dva sockety téhož uživatele = jeden participant, odchod až s posledním', () => {
      const s1 = mockSocket('s1', 'u1');
      const s2 = mockSocket('s2', 'u1');
      gateway.handleVoiceJoin({ room: 'voice-krcma' }, s1);
      gateway.handleVoiceJoin({ room: 'voice-krcma' }, s2);
      expect(gateway.getVoiceRoster('voice-krcma')).toHaveLength(1);
      gateway.handleVoiceLeave({ room: 'voice-krcma' }, s1);
      expect(gateway.getVoiceRoster('voice-krcma')).toHaveLength(1); // s2 stále drží
      gateway.handleVoiceLeave({ room: 'voice-krcma' }, s2);
      expect(gateway.getVoiceRoster('voice-krcma')).toEqual([]);
    });

    it('anti-spoof: socket bez ověřeného userId se do hovoru nedostane', () => {
      const sock = {
        id: 's1',
        data: {},
        join: jest.fn(),
        emit: jest.fn(),
      } as unknown as Socket;
      gateway.handleVoiceJoin({ room: 'voice-krcma' }, sock);
      expect(gateway.getVoiceRoster('voice-krcma')).toEqual([]);
    });

    it('host (guest) se do Voice krčmy nedostane — jen registrovaní', () => {
      const sock = {
        id: 's1',
        data: { userId: 'anon1', isGuest: true, anonName: 'anonym1' },
        join: jest.fn(),
        emit: jest.fn(),
      } as unknown as Socket;
      gateway.handleVoiceJoin({ room: 'voice-krcma' }, sock);
      expect(gateway.getVoiceRoster('voice-krcma')).toEqual([]);
    });

    it('disconnect odebere z hovoru', () => {
      const sock = mockSocket('s1', 'u1');
      gateway.handleVoiceJoin({ room: 'voice-krcma' }, sock);
      expect(gateway.getVoiceRoster('voice-krcma')).toHaveLength(1);
      gateway.handleDisconnect(sock);
      expect(gateway.getVoiceRoster('voice-krcma')).toEqual([]);
    });

    it('neznámá místnost se ignoruje', () => {
      const sock = mockSocket('s1', 'u1');
      gateway.handleVoiceJoin({ room: 'neexistuje' }, sock);
      expect(gateway.getVoiceRoster('voice-krcma')).toEqual([]);
    });
  });

  describe('room counts (krok 4.2c §4)', () => {
    it('getRoomCounts returns presence count per room', async () => {
      gateway.handleRoomJoin({ room: 'camp-1' }, mockSocket('s1'));
      gateway.handleHospodaJoin(mockSocket('s2'));
      await flush();
      expect(gateway.getRoomCounts()).toEqual({
        hospoda: 1,
        'camp-1': 1,
        'camp-2': 0,
        'camp-3': 0,
        'voice-krcma': 0,
      });
    });

    it('broadcasts chat:rooms:presence on join and leave', async () => {
      const serverEmit = gateway.server.emit as jest.Mock;
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      await flush();
      expect(serverEmit).toHaveBeenLastCalledWith(
        'chat:rooms:presence',
        expect.objectContaining({ hospoda: 1 }),
      );
      gateway.handleHospodaLeave(sock);
      expect(serverEmit).toHaveBeenLastCalledWith(
        'chat:rooms:presence',
        expect.objectContaining({ hospoda: 0 }),
      );
    });
  });

  describe('systémové zprávy (krok 4.2d §2)', () => {
    it('uloží systémovou hlášku při příchodu i odchodu (jméno z DB)', async () => {
      users.findById.mockResolvedValue({ username: 'Tyky' } as Awaited<
        ReturnType<UsersService['findById']>
      >);
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      await flush();
      expect(service.saveSystemMessage).toHaveBeenLastCalledWith(
        'hospoda',
        expect.stringContaining('Tyky'),
      );
      gateway.handleHospodaLeave(sock);
      await flush();
      expect(service.saveSystemMessage).toHaveBeenLastCalledWith(
        'hospoda',
        expect.stringContaining('Tyky'),
      );
    });
  });

  describe('heartbeat + cleanup (krok 4.2c §5)', () => {
    it('heartbeat keeps the user alive past the cleanup threshold', async () => {
      jest.useFakeTimers();
      try {
        const sock = mockSocket('s1');
        gateway.handleHospodaJoin(sock);
        await flush();
        jest.advanceTimersByTime(50 * 60_000);
        gateway.handleHeartbeat(sock);
        jest.advanceTimersByTime(50 * 60_000);
        expect(gateway.cleanupInactive(60 * 60_000)).toBe(0);
        expect(gateway.getPresence('hospoda')).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('cleanupInactive removes idle user from all rooms', async () => {
      jest.useFakeTimers();
      try {
        const sock = mockSocket('s1');
        gateway.handleHospodaJoin(sock);
        gateway.handleRoomJoin({ room: 'camp-1' }, sock);
        await flush();
        jest.advanceTimersByTime(70 * 60_000);
        expect(gateway.cleanupInactive(60 * 60_000)).toBe(1);
        expect(gateway.getPresence('hospoda')).toEqual([]);
        expect(gateway.getPresence('camp-1')).toEqual([]);
        expect(gateway.server.emit).toHaveBeenLastCalledWith(
          'chat:rooms:presence',
          expect.objectContaining({ hospoda: 0, 'camp-1': 0 }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('reakce (krok 4.3a)', () => {
    it('chat:reaction:toggle deleguje na service.toggleReaction', async () => {
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      await flush();
      gateway.handleReaction(
        { room: 'hospoda', messageId: 'm1', emoji: '👍' },
        sock,
      );
      await flush();
      expect(service.toggleReaction).toHaveBeenCalledWith(
        'hospoda',
        'm1',
        'u1',
        '👍',
      );
    });

    it('ignoruje reakci z neevidovaného socketu', () => {
      gateway.handleReaction(
        { room: 'hospoda', messageId: 'm1', emoji: '👍' },
        mockSocket('s9'),
      );
      expect(service.toggleReaction).not.toHaveBeenCalled();
    });

    it('ignoruje příliš dlouhý emoji', async () => {
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      await flush();
      gateway.handleReaction(
        { room: 'hospoda', messageId: 'm1', emoji: 'x'.repeat(20) },
        sock,
      );
      expect(service.toggleReaction).not.toHaveBeenCalled();
    });

    it('veřejnou reakci broadcastuje celé místnosti', () => {
      gateway.handleGlobalMessageReaction({
        channelId: 'hospoda-id',
        messageId: 'm1',
        reactions: { '👍': ['u1'] },
        visibleTo: [],
      });
      expect(gateway.server.to).toHaveBeenCalledWith('chat:hospoda-id');
      expect(emit).toHaveBeenCalledWith('chat:message:reaction', {
        messageId: 'm1',
        channelId: 'hospoda-id',
        reactions: { '👍': ['u1'] },
      });
    });

    it('reakci na whisper pošle jen účastníkům', () => {
      gateway.handleGlobalMessageReaction({
        channelId: 'hospoda-id',
        messageId: 'm1',
        reactions: { '👍': ['u1'] },
        visibleTo: ['u1', 'u2'],
      });
      expect(gateway.server.to).toHaveBeenCalledWith('user:u1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:u2');
      expect(gateway.server.to).not.toHaveBeenCalledWith('chat:hospoda-id');
    });
  });

  describe('handleWhisper — přílohy (krok 4.3b)', () => {
    const att = [
      {
        url: 'https://res.cloudinary.com/c/global-chat/hospoda/a',
        publicId: 'global-chat/hospoda/a',
        type: 'image' as const,
        mimeType: 'image/png',
        filename: 'a.png',
        size: 10,
      },
    ];

    it('předá přílohy do sendWhisper i u whisperu bez textu', async () => {
      users.findById.mockResolvedValue({ username: 'gandalf' } as Awaited<
        ReturnType<UsersService['findById']>
      >);
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      await flush();
      gateway.handleWhisper(
        { toUserId: 'u2', room: 'hospoda', attachments: att },
        sock,
      );
      expect(service.sendWhisper).toHaveBeenCalledWith(
        'hospoda',
        { id: 'u1', username: 'gandalf' },
        'u2',
        '',
        undefined,
        undefined,
        att,
      );
    });

    it('ignoruje whisper bez textu i bez příloh', async () => {
      const sock = mockSocket('s1');
      gateway.handleHospodaJoin(sock);
      await flush();
      gateway.handleWhisper({ toUserId: 'u2', room: 'hospoda' }, sock);
      expect(service.sendWhisper).not.toHaveBeenCalled();
    });
  });

  describe('environment', () => {
    it('default žánr per room (16.6a): camp-1 fantasy, camp-2 mystic, camp-3 scifi', () => {
      expect(gateway.getEnvironment('camp-1')).toEqual({
        style: 'fantasy',
        placeId: '1',
      });
      expect(gateway.getEnvironment('camp-2')).toEqual({
        style: 'mystic',
        placeId: '1',
      });
      expect(gateway.getEnvironment('camp-3')).toEqual({
        style: 'scifi',
        placeId: '1',
      });
    });

    it('setEnvironment stores and broadcasts to the room channel', () => {
      const result = gateway.setEnvironment('camp-2', {
        style: 'scifi',
        placeId: '7',
      });
      expect(result).toEqual({ style: 'scifi', placeId: '7' });
      expect(gateway.getEnvironment('camp-2')).toEqual({
        style: 'scifi',
        placeId: '7',
      });
      expect(gateway.server.to).toHaveBeenCalledWith('chat:camp-2-id');
      expect(emit).toHaveBeenCalledWith('chat:room:environment', {
        room: 'camp-2',
        style: 'scifi',
        placeId: '7',
      });
    });
  });

  describe('startHere (16.6b)', () => {
    it('setStartHere uloží a odbroadcastne chat:room:startHere', () => {
      const data = {
        lines: [
          {
            senderName: 'Aragorn',
            content: 'ahoj',
            color: null,
            createdAt: new Date(),
          },
        ],
        byUserName: 'Aragorn',
        at: new Date(),
      };
      gateway.setStartHere('camp-1', data);
      expect(gateway.getStartHere('camp-1')).toEqual(data);
      expect(gateway.server.to).toHaveBeenCalledWith('chat:camp-1-id');
      expect(emit).toHaveBeenCalledWith('chat:room:startHere', {
        room: 'camp-1',
        startHere: data,
      });
    });

    it('clearStartHere broadcastne null jen když stav existoval', () => {
      // Prázdný stav → žádný broadcast.
      gateway.clearStartHere('camp-2');
      expect(emit).not.toHaveBeenCalledWith(
        'chat:room:startHere',
        expect.anything(),
      );
      // Po setu clear vyresetuje + broadcastne null.
      gateway.setStartHere('camp-2', {
        lines: [],
        byUserName: 'X',
        at: new Date(),
      });
      gateway.clearStartHere('camp-2');
      expect(gateway.getStartHere('camp-2')).toBeNull();
      expect(emit).toHaveBeenLastCalledWith('chat:room:startHere', {
        room: 'camp-2',
        startHere: null,
      });
    });

    it('nový příchozí dostane aktuální startHere jen sobě', async () => {
      gateway.setStartHere('camp-1', {
        lines: [],
        byUserName: 'Aragorn',
        at: new Date(),
      });
      const sock = mockSocket('s1', 'u1');
      gateway.handleRoomJoin({ room: 'camp-1' }, sock);
      await flush();
      expect(sock.emit).toHaveBeenCalledWith(
        'chat:room:startHere',
        expect.objectContaining({ room: 'camp-1' }),
      );
    });
  });

  describe('applyRotation (16.6a)', () => {
    it('nastaví default žánr + náhodnou lokaci a vyresetuje startHere', async () => {
      // Předtím tam byl startHere (po loadu).
      gateway.setStartHere('camp-3', {
        lines: [],
        byUserName: 'X',
        at: new Date(),
      });
      await gateway.applyRotation('camp-3');

      expect(service.getRoomDefault).toHaveBeenCalledWith('camp-3');
      expect(service.randomPlaceId).toHaveBeenCalled();
      expect(gateway.getEnvironment('camp-3')).toEqual({
        style: 'scifi', // z mocku getRoomDefault
        placeId: '13', // z mocku randomPlaceId
      });
      expect(gateway.getStartHere('camp-3')).toBeNull();
      // Broadcast prostředí i reset startHere.
      expect(emit).toHaveBeenCalledWith('chat:room:environment', {
        room: 'camp-3',
        style: 'scifi',
        placeId: '13',
      });
      expect(emit).toHaveBeenCalledWith('chat:room:startHere', {
        room: 'camp-3',
        startHere: null,
      });
    });
  });
});
