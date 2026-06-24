import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalChatService } from './global-chat.service';
import { PushService } from '../push/push.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';
import { AnonBanService } from './anon-ban.service';
import type { IChatChannelRepository } from '../chat/interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import type { ChatChannel } from '../chat/interfaces/chat-channel.interface';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockChannel: ChatChannel = {
  id: 'global-ch-id',
  name: 'Interdimenzionální hospoda',
  worldId: null,
  groupId: null,
  isGlobal: true,
  accessMode: 'all',
  allowedRoles: [],
  allowedMemberIds: [],
  order: 0,
  isDeleted: false,
  type: 'hospoda',
  createdAt: new Date(),
};

const makeMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg1',
  channelId: 'global-ch-id',
  worldId: null,
  senderId: 'u1',
  senderName: 'gandalf',
  content: 'hello',
  isEdited: false,
  isDeleted: false,
  reactions: {},
  attachments: [],
  expiresAt: new Date(Date.now() + 3600000),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
  customFont: overrides.customFont ?? null,
  customFontSize: overrides.customFontSize ?? null,
  color: overrides.color ?? null,
  isDiceRoll: overrides.isDiceRoll ?? false,
  mentions: overrides.mentions ?? [],
  dicePayload: overrides.dicePayload ?? null,
  diceSkin: overrides.diceSkin ?? null,
});

describe('GlobalChatService', () => {
  let service: GlobalChatService;
  let channelRepo: jest.Mocked<IChatChannelRepository>;
  let messageRepo: jest.Mocked<IChatMessageRepository>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let usersService: { findById: jest.Mock };
  let anonBan: { isBanned: jest.Mock };

  beforeEach(async () => {
    channelRepo = {
      findGlobal: jest.fn(),
      findGlobalByType: jest.fn(),
      findById: jest.fn(),
      findByGroupId: jest.fn(),
      findByWorldId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      softDeleteByWorldId: jest.fn(),
      restoreByWorldId: jest.fn(),
      bulkUpdateOrders: jest.fn(),
      addCombatant: jest.fn(),
      updateCombatant: jest.fn(),
      removeCombatant: jest.fn(),
      setCombat: jest.fn(),
    };

    messageRepo = {
      findById: jest.fn(),
      findByChannelId: jest.fn(),
      findByNonce: jest.fn(),
      countAfter: jest.fn(),
      countMentionsAfter: jest.fn(),
      searchInChannels: jest.fn(),
      findFeed: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDeleteByChannelId: jest.fn(),
      softDeleteByWorldId: jest.fn(),
      restoreByWorldId: jest.fn(),
      addReaction: jest.fn(),
      removeReaction: jest.fn(),
      pruneChannel: jest.fn(),
    };

    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    // Default profil: má účet i postavu → testy si přepisují per case.
    usersService = {
      findById: jest.fn().mockResolvedValue({
        avatarUrl: 'acc.webp',
        characterName: 'Aragorn',
        characterAvatarUrl: 'aragorn.webp',
      }),
    };

    // 15.8 — default: host není zabanovaný (testy si přepíšou).
    anonBan = { isBanned: jest.fn().mockResolvedValue(false) };

    const module = await Test.createTestingModule({
      providers: [
        GlobalChatService,
        { provide: 'IChatChannelRepository', useValue: channelRepo },
        { provide: 'IChatMessageRepository', useValue: messageRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: PushService,
          useValue: { notifyAll: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: UploadService,
          useValue: {
            getCloudinaryBaseUrl: () =>
              'https://res.cloudinary.com/test-cloud/',
            deleteAttachments: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: UsersService, useValue: usersService },
        { provide: AnonBanService, useValue: anonBan },
      ],
    }).compile();

    service = module.get(GlobalChatService);
  });

  /** Všechny 4 kanály existují → channelId = `${type}-id` (hospoda = global-ch-id). */
  const initAllChannels = async () => {
    channelRepo.findGlobalByType.mockImplementation((type: string) =>
      Promise.resolve(
        type === 'hospoda'
          ? mockChannel
          : { ...mockChannel, id: `${type}-id`, type },
      ),
    );
    await service.onModuleInit();
  };

  describe('onModuleInit', () => {
    it('reuses existing channels for all 4 rooms — no save', async () => {
      await initAllChannels();
      expect(channelRepo.save).not.toHaveBeenCalled();
      expect(service.getChannelId('hospoda')).toBe('global-ch-id');
      expect(service.getChannelId('rozcesti-1')).toBe('rozcesti-1-id');
      expect(service.getChannelId('rozcesti-2')).toBe('rozcesti-2-id');
      expect(service.getChannelId('rozcesti-3')).toBe('rozcesti-3-id');
    });

    it('creates missing Rozcestí channels', async () => {
      channelRepo.findGlobalByType.mockImplementation((type: string) =>
        Promise.resolve(type === 'hospoda' ? mockChannel : null),
      );
      channelRepo.save.mockImplementation((data) =>
        Promise.resolve({ ...mockChannel, id: `${data.type}-id` }),
      );
      await service.onModuleInit();
      expect(channelRepo.save).toHaveBeenCalledTimes(3);
      expect(service.getChannelId('rozcesti-1')).toBe('rozcesti-1-id');
    });

    it('migrates legacy Hospoda channel (type "all") by setting type', async () => {
      const legacy = { ...mockChannel, type: 'all' };
      channelRepo.findGlobalByType.mockResolvedValue(null);
      channelRepo.findGlobal.mockResolvedValue(legacy);
      channelRepo.update.mockResolvedValue({ ...legacy, type: 'hospoda' });
      channelRepo.save.mockImplementation((data) =>
        Promise.resolve({ ...mockChannel, id: `${data.type}-id` }),
      );
      await service.onModuleInit();
      expect(channelRepo.update).toHaveBeenCalledWith('global-ch-id', {
        type: 'hospoda',
      });
      expect(service.getChannelId('hospoda')).toBe('global-ch-id');
    });
  });

  describe('getMessages', () => {
    beforeEach(initAllChannels);

    it('W2: filters out deleted messages', async () => {
      const messages = [makeMsg(), makeMsg({ id: 'msg2', isDeleted: true })];
      messageRepo.findByChannelId.mockResolvedValue(messages);
      const result = await service.getMessages('hospoda', 'u1', {});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg1');
    });

    it('filters out whispers not visible to the user', async () => {
      const messages = [
        makeMsg({ senderId: 'u99', visibleTo: ['u2', 'u3'] }),
        makeMsg({ id: 'msg2', senderId: 'u99', visibleTo: ['u1', 'u2'] }),
        makeMsg({ id: 'msg3' }),
      ];
      messageRepo.findByChannelId.mockResolvedValue(messages);
      const result = await service.getMessages('hospoda', 'u1', {});
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toEqual(['msg2', 'msg3']);
    });

    it('W1: sender sees own whisper in history even if not in visibleTo', async () => {
      const messages = [
        makeMsg({ id: 'msg1', senderId: 'u1', visibleTo: ['u2'] }),
        makeMsg({ id: 'msg2', senderId: 'u2', visibleTo: ['u2'] }),
        makeMsg({ id: 'msg3' }),
      ];
      messageRepo.findByChannelId.mockResolvedValue(messages);
      const result = await service.getMessages('hospoda', 'u1', {});
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg3']);
    });

    it('caps limit at 100', async () => {
      messageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('hospoda', 'u1', { limit: 999 });
      expect(messageRepo.findByChannelId).toHaveBeenCalledWith('global-ch-id', {
        before: undefined,
        limit: 100,
      });
    });

    it('isolates channels — Rozcestí I. queries its own channelId', async () => {
      messageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('rozcesti-1', 'u1', {});
      expect(messageRepo.findByChannelId).toHaveBeenCalledWith(
        'rozcesti-1-id',
        expect.any(Object),
      );
    });
  });

  describe('sendMessage', () => {
    const mockUser = { id: 'u1', role: UserRole.Hrac, username: 'gandalf' };
    beforeEach(initAllChannels);

    it('saves message with worldId=null, expiresAt=now+1h, senderName=username', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      const before = Date.now();
      await service.sendMessage('hospoda', { content: 'hello' }, mockUser);
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.worldId).toBeNull();
      expect(call.senderName).toBe('gandalf');
      expect((call.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
        before + 3600000 - 100,
      );
    });

    it('emits chat.global.message.created with the room channelId', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage('rozcesti-2', { content: 'hello' }, mockUser);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.global.message.created',
        expect.objectContaining({ channelId: 'rozcesti-2-id' }),
      );
    });

    it('stores empty array when visibleTo is not provided', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage('hospoda', { content: 'hello' }, mockUser);
      expect(messageRepo.save.mock.calls[0][0].visibleTo).toEqual([]);
    });

    it('stores color from dto', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage(
        'hospoda',
        { content: 'hello', color: '#ff8800' },
        mockUser,
      );
      expect(messageRepo.save.mock.calls[0][0].color).toBe('#ff8800');
    });

    it('stores color=null when not provided', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage('hospoda', { content: 'hello' }, mockUser);
      expect(messageRepo.save.mock.calls[0][0].color).toBeNull();
    });

    // 4.2e §1 — snapshot identity dle místnosti.
    it('Rozcestí: ukládá jméno + avatar postavy z profilu', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage('rozcesti-1', { content: 'ahoj' }, mockUser);
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.senderName).toBe('Aragorn');
      expect(call.senderAvatarUrl).toBe('aragorn.webp');
    });

    it('Hospoda: ukládá username + avatar účtu (ne postavu)', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage('hospoda', { content: 'ahoj' }, mockUser);
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.senderName).toBe('gandalf');
      expect(call.senderAvatarUrl).toBe('acc.webp');
    });

    it('Rozcestí bez postavy: fallback na účet (username + avatarUrl)', async () => {
      usersService.findById.mockResolvedValue({ avatarUrl: 'acc.webp' });
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage('rozcesti-2', { content: 'ahoj' }, mockUser);
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.senderName).toBe('gandalf');
      expect(call.senderAvatarUrl).toBe('acc.webp');
    });

    // 15.8 — host (anonym).
    it('host (guest): senderName=anonName, isAnonymous=true, bez DB profilu', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage(
        'hospoda',
        { content: 'ahoj' },
        {
          id: 'anon_1',
          username: 'anonym1234',
          role: UserRole.Guest,
          isGuest: true,
        },
      );
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.senderName).toBe('anonym1234');
      expect(call.isAnonymous).toBe(true);
      expect(call.senderAvatarUrl).toBeUndefined();
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('člen: isAnonymous=false', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage('hospoda', { content: 'ahoj' }, mockUser);
      expect(messageRepo.save.mock.calls[0][0].isAnonymous).toBe(false);
    });

    it('zabanovaný host → 403 ANON_BANNED, zpráva se neuloží', async () => {
      anonBan.isBanned.mockResolvedValue(true);
      await expect(
        service.sendMessage(
          'hospoda',
          { content: 'x' },
          {
            id: 'anon_b',
            username: 'anonym1',
            role: UserRole.Guest,
            isGuest: true,
          },
        ),
      ).rejects.toMatchObject({ response: { code: 'ANON_BANNED' } });
      expect(messageRepo.save).not.toHaveBeenCalled();
    });

    it('profil nenačten: zpráva projde, avatar undefined', async () => {
      usersService.findById.mockRejectedValue(new NotFoundException({}));
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage('rozcesti-1', { content: 'ahoj' }, mockUser);
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.senderName).toBe('gandalf');
      expect(call.senderAvatarUrl).toBeUndefined();
    });
  });

  describe('sendWhisper', () => {
    beforeEach(initAllChannels);

    it('stores visibleTo as [from, to] and color', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendWhisper(
        'hospoda',
        { id: 'u1', username: 'gandalf' },
        'u2',
        'pst',
        '#abcdef',
      );
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.visibleTo).toEqual(['u1', 'u2']);
      expect(call.color).toBe('#abcdef');
    });

    it('stores color=null when not provided', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendWhisper(
        'hospoda',
        { id: 'u1', username: 'gandalf' },
        'u2',
        'pst',
      );
      expect(messageRepo.save.mock.calls[0][0].color).toBeNull();
    });

    it('saves whisper into the requested room channel', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendWhisper(
        'rozcesti-3',
        { id: 'u1', username: 'gandalf' },
        'u2',
        'pst',
      );
      expect(messageRepo.save.mock.calls[0][0].channelId).toBe('rozcesti-3-id');
    });

    // 4.2e §1 — whisper v Rozcestí nese identitu postavy (snapshot).
    it('Rozcestí: whisper nese jméno + avatar postavy', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendWhisper(
        'rozcesti-1',
        { id: 'u1', username: 'gandalf' },
        'u2',
        'pst',
      );
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.senderName).toBe('Aragorn');
      expect(call.senderAvatarUrl).toBe('aragorn.webp');
    });
  });

  describe('saveSystemMessage (krok 4.2d §2)', () => {
    beforeEach(initAllChannels);

    it('uloží systémovou zprávu s isSystem=true a emitne ji', async () => {
      messageRepo.save.mockResolvedValue(makeMsg({ isSystem: true }));
      await service.saveSystemMessage(
        'rozcesti-1',
        'Na rozcestí se objevuje X.',
      );
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.isSystem).toBe(true);
      expect(call.content).toBe('Na rozcestí se objevuje X.');
      expect(call.channelId).toBe('rozcesti-1-id');
      expect(call.visibleTo).toEqual([]);
      // senderId/senderName musí být neprázdné — schema má `required: true`.
      expect(call.senderId).toBeTruthy();
      expect(call.senderName).toBeTruthy();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.global.message.created',
        expect.objectContaining({ channelId: 'rozcesti-1-id' }),
      );
    });
  });

  describe('deleteMessage', () => {
    beforeEach(initAllChannels);

    it('soft deletes and emits event', async () => {
      messageRepo.findById.mockResolvedValue(makeMsg());
      messageRepo.update.mockResolvedValue(
        makeMsg({ isDeleted: true, content: null }),
      );
      await service.deleteMessage('hospoda', 'msg1');
      expect(messageRepo.update).toHaveBeenCalledWith('msg1', {
        isDeleted: true,
        content: null,
        attachments: [],
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.global.message.deleted',
        expect.any(Object),
      );
    });

    it('throws NotFoundException for unknown message', async () => {
      messageRepo.findById.mockResolvedValue(null);
      await expect(service.deleteMessage('hospoda', 'unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException if message belongs to a different channel', async () => {
      messageRepo.findById.mockResolvedValue(
        makeMsg({ channelId: 'other-channel' }),
      );
      await expect(service.deleteMessage('hospoda', 'msg1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reply (krok 4.3a)', () => {
    const mockUser = { id: 'u2', role: UserRole.Hrac, username: 'frodo' };
    beforeEach(initAllChannels);

    it('fills replyTo* from a valid target message', async () => {
      const target = makeMsg({
        id: 'tgt',
        content: 'pozdrav',
        senderName: 'gandalf',
      });
      messageRepo.findById.mockResolvedValue(target);
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage(
        'hospoda',
        { content: 'ahoj', replyToId: 'tgt' },
        mockUser,
      );
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.replyToId).toBe('tgt');
      expect(call.replyToPreview).toBe('pozdrav');
      expect(call.replyToSenderName).toBe('gandalf');
    });

    it('truncates replyToPreview to 120 chars', async () => {
      const long = 'x'.repeat(200);
      messageRepo.findById.mockResolvedValue(
        makeMsg({ id: 'tgt', content: long }),
      );
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage(
        'hospoda',
        { content: 'ahoj', replyToId: 'tgt' },
        mockUser,
      );
      expect(messageRepo.save.mock.calls[0][0].replyToPreview).toHaveLength(
        120,
      );
    });

    it('falls back silently for unknown / cross-channel / deleted / system target', async () => {
      const cases: (ChatMessage | null)[] = [
        null,
        makeMsg({ id: 'tgt', channelId: 'other-channel' }),
        makeMsg({ id: 'tgt', isDeleted: true }),
        makeMsg({ id: 'tgt', isSystem: true }),
      ];
      for (const target of cases) {
        messageRepo.save.mockClear();
        messageRepo.findById.mockResolvedValue(target);
        messageRepo.save.mockResolvedValue(makeMsg());
        await service.sendMessage(
          'hospoda',
          { content: 'ahoj', replyToId: 'tgt' },
          mockUser,
        );
        const call = messageRepo.save.mock.calls[0][0];
        expect(call.replyToId).toBeUndefined();
        expect(call.replyToPreview).toBeUndefined();
      }
    });

    it('resolves reply for sendWhisper too', async () => {
      messageRepo.findById.mockResolvedValue(
        makeMsg({ id: 'tgt', content: 'pst', senderName: 'gandalf' }),
      );
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendWhisper(
        'hospoda',
        { id: 'u1', username: 'gandalf' },
        'u2',
        'odpoved',
        undefined,
        'tgt',
      );
      expect(messageRepo.save.mock.calls[0][0].replyToId).toBe('tgt');
    });
  });

  describe('toggleReaction (krok 4.3a)', () => {
    beforeEach(initAllChannels);

    it('adds a reaction and emits chat.global.message.reaction', async () => {
      messageRepo.findById.mockResolvedValue(
        makeMsg({ id: 'm1', reactions: {} }),
      );
      messageRepo.update.mockResolvedValue(makeMsg());
      await service.toggleReaction('hospoda', 'm1', 'u1', '👍');
      expect(messageRepo.update).toHaveBeenCalledWith('m1', {
        reactions: { '👍': ['u1'] },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.global.message.reaction',
        expect.objectContaining({
          channelId: 'global-ch-id',
          messageId: 'm1',
          reactions: { '👍': ['u1'] },
        }),
      );
    });

    it('removes own reaction and deletes the emptied emoji key', async () => {
      messageRepo.findById.mockResolvedValue(
        makeMsg({ id: 'm1', reactions: { '👍': ['u1'] } }),
      );
      messageRepo.update.mockResolvedValue(makeMsg());
      await service.toggleReaction('hospoda', 'm1', 'u1', '👍');
      expect(messageRepo.update).toHaveBeenCalledWith('m1', { reactions: {} });
    });

    it('keeps other users when removing own reaction', async () => {
      messageRepo.findById.mockResolvedValue(
        makeMsg({ id: 'm1', reactions: { '👍': ['u1', 'u2'] } }),
      );
      messageRepo.update.mockResolvedValue(makeMsg());
      await service.toggleReaction('hospoda', 'm1', 'u1', '👍');
      expect(messageRepo.update).toHaveBeenCalledWith('m1', {
        reactions: { '👍': ['u2'] },
      });
    });

    it('ignores deleted / system / cross-channel / unknown messages', async () => {
      const cases: (ChatMessage | null)[] = [
        null,
        makeMsg({ id: 'm1', isDeleted: true }),
        makeMsg({ id: 'm1', isSystem: true }),
        makeMsg({ id: 'm1', channelId: 'other-channel' }),
      ];
      for (const target of cases) {
        messageRepo.update.mockClear();
        messageRepo.findById.mockResolvedValue(target);
        await service.toggleReaction('hospoda', 'm1', 'u1', '👍');
        expect(messageRepo.update).not.toHaveBeenCalled();
      }
    });

    it('rejects a reaction from a non-participant of a whisper', async () => {
      messageRepo.findById.mockResolvedValue(
        makeMsg({ id: 'm1', visibleTo: ['u1', 'u2'] }),
      );
      await service.toggleReaction('hospoda', 'm1', 'u9', '👍');
      expect(messageRepo.update).not.toHaveBeenCalled();
    });

    it('allows a reaction from a whisper participant', async () => {
      messageRepo.findById.mockResolvedValue(
        makeMsg({ id: 'm1', visibleTo: ['u1', 'u2'] }),
      );
      messageRepo.update.mockResolvedValue(makeMsg());
      await service.toggleReaction('hospoda', 'm1', 'u2', '👍');
      expect(messageRepo.update).toHaveBeenCalled();
    });
  });

  describe('attachments (krok 4.3b)', () => {
    const mockUser = { id: 'u1', role: UserRole.Hrac, username: 'gandalf' };
    beforeEach(initAllChannels);

    const validAtt = (overrides: Record<string, unknown> = {}) => ({
      url: 'https://res.cloudinary.com/test-cloud/image/upload/global-chat/hospoda/abc.png',
      publicId: 'global-chat/hospoda/abc',
      type: 'image' as const,
      mimeType: 'image/png',
      filename: 'abc.png',
      size: 1234,
      ...overrides,
    });

    it('stores valid attachments on the message', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage(
        'hospoda',
        { content: 'hi', attachments: [validAtt()] },
        mockUser,
      );
      expect(messageRepo.save.mock.calls[0][0].attachments).toHaveLength(1);
    });

    it('accepts an attachment-only message (empty content)', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await expect(
        service.sendMessage('hospoda', { attachments: [validAtt()] }, mockUser),
      ).resolves.toBeDefined();
    });

    it('rejects an empty message (no content, no attachments)', async () => {
      await expect(
        service.sendMessage('hospoda', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an attachment with a foreign URL', async () => {
      await expect(
        service.sendMessage(
          'hospoda',
          {
            content: 'x',
            attachments: [validAtt({ url: 'https://evil.example/x.png' })],
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an attachment outside the global-chat folder', async () => {
      await expect(
        service.sendMessage(
          'hospoda',
          { content: 'x', attachments: [validAtt({ publicId: 'gallery/x' })] },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects more than 10 image attachments', async () => {
      const many = Array.from({ length: 11 }, () => validAtt());
      await expect(
        service.sendMessage(
          'hospoda',
          { content: 'x', attachments: many },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects more than 4 document attachments', async () => {
      const docs = Array.from({ length: 5 }, () =>
        validAtt({
          type: 'document',
          publicId: 'global-chat/hospoda/d',
          mimeType: 'application/pdf',
        }),
      );
      await expect(
        service.sendMessage(
          'hospoda',
          { content: 'x', attachments: docs },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('passes attachments through sendWhisper', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendWhisper(
        'hospoda',
        { id: 'u1', username: 'gandalf' },
        'u2',
        '',
        undefined,
        undefined,
        [validAtt()],
      );
      expect(messageRepo.save.mock.calls[0][0].attachments).toHaveLength(1);
    });

    it('includes attachments in the delete event', async () => {
      const att = validAtt();
      messageRepo.findById.mockResolvedValue(makeMsg({ attachments: [att] }));
      messageRepo.update.mockResolvedValue(makeMsg());
      await service.deleteMessage('hospoda', 'msg1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.global.message.deleted',
        expect.objectContaining({ attachments: [att] }),
      );
    });
  });
});
