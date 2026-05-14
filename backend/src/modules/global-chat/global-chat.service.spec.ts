import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalChatService } from './global-chat.service';
import { PushService } from '../push/push.service';
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
  type: 'all',
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
  color: overrides.color ?? null,
  isDiceRoll: overrides.isDiceRoll ?? false,
});

describe('GlobalChatService', () => {
  let service: GlobalChatService;
  let channelRepo: jest.Mocked<IChatChannelRepository>;
  let messageRepo: jest.Mocked<IChatMessageRepository>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    channelRepo = {
      findGlobal: jest.fn(),
      findById: jest.fn(),
      findByGroupId: jest.fn(),
      findByWorldId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      softDeleteByWorldId: jest.fn(),
    };

    messageRepo = {
      findById: jest.fn(),
      findByChannelId: jest.fn(),
      countAfter: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDeleteByChannelId: jest.fn(),
      softDeleteByWorldId: jest.fn(),
      addReaction: jest.fn(),
      removeReaction: jest.fn(),
      pruneChannel: jest.fn(),
    };

    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

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
      ],
    }).compile();

    service = module.get(GlobalChatService);
  });

  describe('onModuleInit', () => {
    it('should reuse existing global channel', async () => {
      channelRepo.findGlobal.mockResolvedValue(mockChannel);
      await service.onModuleInit();
      expect(channelRepo.save).not.toHaveBeenCalled();
      expect(service.getGlobalChannelId()).toBe('global-ch-id');
    });

    it('should create global channel if none exists', async () => {
      channelRepo.findGlobal.mockResolvedValue(null);
      channelRepo.save.mockResolvedValue(mockChannel);
      await service.onModuleInit();
      expect(channelRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isGlobal: true,
          worldId: null,
          groupId: null,
        }),
      );
      expect(service.getGlobalChannelId()).toBe('global-ch-id');
    });
  });

  describe('getMessages', () => {
    beforeEach(async () => {
      channelRepo.findGlobal.mockResolvedValue(mockChannel);
      await service.onModuleInit();
    });

    it('should throw InternalServerErrorException if not initialized', async () => {
      (service as any).globalChannelId = undefined;
      await expect(service.getMessages('u1', {})).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('W2: should filter out deleted messages', async () => {
      const messages = [makeMsg(), makeMsg({ id: 'msg2', isDeleted: true })];
      messageRepo.findByChannelId.mockResolvedValue(messages);
      const result = await service.getMessages('u1', {});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg1');
    });

    it('should filter out whispers not visible to the user', async () => {
      const messages = [
        makeMsg({ senderId: 'u99', visibleTo: ['u2', 'u3'] }),
        makeMsg({ id: 'msg2', senderId: 'u99', visibleTo: ['u1', 'u2'] }),
        makeMsg({ id: 'msg3' }),
      ];
      messageRepo.findByChannelId.mockResolvedValue(messages);
      const result = await service.getMessages('u1', {});
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
      const result = await service.getMessages('u1', {});
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg3']);
    });

    it('should cap limit at 100', async () => {
      messageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('u1', { limit: 999 });
      expect(messageRepo.findByChannelId).toHaveBeenCalledWith('global-ch-id', {
        before: undefined,
        limit: 100,
      });
    });
  });

  describe('sendMessage', () => {
    const mockUser = { id: 'u1', role: UserRole.Hrac, username: 'gandalf' };

    beforeEach(async () => {
      channelRepo.findGlobal.mockResolvedValue(mockChannel);
      await service.onModuleInit();
    });

    it('should save message with worldId=null, expiresAt=now+1h, senderName=username', async () => {
      const saved = makeMsg();
      messageRepo.save.mockResolvedValue(saved);
      const before = Date.now();

      await service.sendMessage({ content: 'hello' }, mockUser);

      const call = messageRepo.save.mock.calls[0][0];
      expect(call.worldId).toBeNull();
      expect(call.senderName).toBe('gandalf');
      expect(call.expiresAt).toBeInstanceOf(Date);
      expect((call.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
        before + 3600000 - 100,
      );
    });

    it('should emit chat.global.message.created event', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage({ content: 'hello' }, mockUser);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.global.message.created',
        expect.objectContaining({
          channelId: 'global-ch-id',
        }),
      );
    });

    it('should store empty array when visibleTo is not provided', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage({ content: 'hello' }, mockUser);
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.visibleTo).toEqual([]);
    });

    it('should store visibleTo as-is without adding sender', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage(
        { content: 'šeptám', visibleTo: ['u2'] },
        mockUser,
      );
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.visibleTo).toEqual(['u2']);
    });
  });

  describe('deleteMessage', () => {
    beforeEach(async () => {
      channelRepo.findGlobal.mockResolvedValue(mockChannel);
      await service.onModuleInit();
    });

    it('should soft delete and emit event', async () => {
      messageRepo.findById.mockResolvedValue(makeMsg());
      messageRepo.update.mockResolvedValue(
        makeMsg({ isDeleted: true, content: null }),
      );
      await service.deleteMessage('msg1');
      expect(messageRepo.update).toHaveBeenCalledWith('msg1', {
        isDeleted: true,
        content: null,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.global.message.deleted',
        expect.any(Object),
      );
    });

    it('should throw NotFoundException for unknown message', async () => {
      messageRepo.findById.mockResolvedValue(null);
      await expect(service.deleteMessage('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if message belongs to different channel', async () => {
      messageRepo.findById.mockResolvedValue(
        makeMsg({ channelId: 'other-channel' }),
      );
      await expect(service.deleteMessage('msg1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
