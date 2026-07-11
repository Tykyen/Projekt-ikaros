import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IkarosMessagesService } from './ikaros-messages.service';
import type { IIkarosMessagesRepository } from './interfaces/ikaros-messages-repository.interface';
import type { IkarosMessage } from './interfaces/ikaros-message.interface';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';

const makeMsg = (overrides: Partial<IkarosMessage> = {}): IkarosMessage => ({
  id: 'msg1',
  senderId: 'sender1',
  senderName: 'Alice',
  recipientId: 'recipient1',
  recipientName: 'Bob',
  subject: 'Ahoj',
  body: 'Jak se máš?',
  sentAtUtc: new Date(),
  isRead: false,
  deletedBySender: false,
  deletedByRecipient: false,
  conversationId: 'msg1',
  replyToId: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('IkarosMessagesService', () => {
  let service: IkarosMessagesService;
  let msgRepo: jest.Mocked<IIkarosMessagesRepository>;
  let usersService: { findById: jest.Mock };
  let friendsRepo: { findActiveBetween: jest.Mock };
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const sender = { id: 'sender1', username: 'Alice', role: UserRole.Hrac };

  beforeEach(async () => {
    msgRepo = {
      findById: jest.fn(),
      findInbox: jest.fn(),
      findSent: jest.fn(),
      findConversation: jest.fn(),
      countUnreadMessages: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      anonymizeByUser: jest.fn(),
    };
    usersService = { findById: jest.fn() };
    friendsRepo = { findActiveBetween: jest.fn() };
    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    const module = await Test.createTestingModule({
      providers: [
        IkarosMessagesService,
        { provide: 'IIkarosMessagesRepository', useValue: msgRepo },
        { provide: UsersService, useValue: usersService },
        { provide: 'IFriendshipsRepository', useValue: friendsRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(IkarosMessagesService);
    jest.clearAllMocks();
  });

  describe('create — nové vlákno', () => {
    // N-34 — kořen vlákna se ukládá s předgenerovaným _id == conversationId
    // v JEDNOM zápisu (žádný druhý update → žádné okno s prázdným conversationId).
    it('uloží kořen s předgenerovaným _id = conversationId (1 write, žádný update)', async () => {
      usersService.findById.mockResolvedValue({ profileVisibility: 'public' });
      msgRepo.save.mockResolvedValue(makeMsg({ conversationId: 'msg1' }));

      const result = await service.create(
        {
          subject: 'Ahoj',
          body: 'Jak se máš?',
          recipientId: 'recipient1',
          recipientName: 'Bob',
        },
        sender,
      );

      expect(msgRepo.update).not.toHaveBeenCalled();
      const saveArg = msgRepo.save.mock.calls[0][0] as {
        id?: string;
        conversationId?: string;
      };
      expect(saveArg.id).toBeDefined();
      expect(saveArg.conversationId).toBe(saveArg.id);
      expect(result.conversationId).toBe('msg1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ikaros.message.created',
        expect.objectContaining({
          recipientId: 'recipient1',
          messageId: 'msg1',
        }),
      );
    });
  });

  describe('create — odpověď ve vlákně', () => {
    it('převezme conversationId rodiče a nastaví replyToId', async () => {
      const parent = makeMsg({
        id: 'root1',
        conversationId: 'root1',
        senderId: 'recipient1',
        recipientId: 'sender1',
      });
      msgRepo.findById.mockResolvedValue(parent);
      msgRepo.save.mockResolvedValue(
        makeMsg({ id: 'reply1', conversationId: 'root1', replyToId: 'root1' }),
      );

      await service.create(
        {
          subject: 'Re: Ahoj',
          body: 'Dobře, díky',
          recipientId: 'recipient1',
          recipientName: 'Bob',
          replyToId: 'root1',
        },
        sender,
      );

      expect(msgRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'root1',
          replyToId: 'root1',
        }),
      );
      // reply nevolá D-057 check ani update conversationId
      expect(usersService.findById).not.toHaveBeenCalled();
      expect(msgRepo.update).not.toHaveBeenCalled();
    });

    it('404 pokud rodičovská zpráva neexistuje', async () => {
      msgRepo.findById.mockResolvedValue(null);
      await expect(
        service.create(
          {
            subject: 'Re',
            body: 'x',
            recipientId: 'r',
            recipientName: 'R',
            replyToId: 'nope',
          },
          sender,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('403 pokud odesílatel není účastníkem rodičovského vlákna', async () => {
      msgRepo.findById.mockResolvedValue(
        makeMsg({ senderId: 'x', recipientId: 'y' }),
      );
      await expect(
        service.create(
          {
            subject: 'Re',
            body: 'x',
            recipientId: 'r',
            recipientName: 'R',
            replyToId: 'root1',
          },
          sender,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create — D-057 friend-only příjemce', () => {
    it('403 když příjemce friends-only a odesílatel není přítel', async () => {
      usersService.findById.mockResolvedValue({ profileVisibility: 'friends' });
      friendsRepo.findActiveBetween.mockResolvedValue(null);
      await expect(
        service.create(
          {
            subject: 'Ahoj',
            body: 'x',
            recipientId: 'recipient1',
            recipientName: 'Bob',
          },
          sender,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('projde když odesílatel je přítel', async () => {
      usersService.findById.mockResolvedValue({ profileVisibility: 'friends' });
      friendsRepo.findActiveBetween.mockResolvedValue({ status: 'accepted' });
      msgRepo.save.mockResolvedValue(makeMsg({ conversationId: '' }));
      msgRepo.update.mockResolvedValue(makeMsg());
      await expect(
        service.create(
          {
            subject: 'Ahoj',
            body: 'x',
            recipientId: 'recipient1',
            recipientName: 'Bob',
          },
          sender,
        ),
      ).resolves.toBeDefined();
    });

    it('Admin obejde friend-only check', async () => {
      usersService.findById.mockResolvedValue({ profileVisibility: 'friends' });
      msgRepo.save.mockResolvedValue(makeMsg({ conversationId: '' }));
      msgRepo.update.mockResolvedValue(makeMsg());
      await service.create(
        {
          subject: 'Ahoj',
          body: 'x',
          recipientId: 'recipient1',
          recipientName: 'Bob',
        },
        { id: 'admin1', username: 'Admin', role: UserRole.Admin },
      );
      expect(friendsRepo.findActiveBetween).not.toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('vrátí { unreadCount, systemUnread }', async () => {
      msgRepo.countUnreadMessages.mockResolvedValueOnce(5); // celkem
      msgRepo.countUnreadMessages.mockResolvedValueOnce(2); // jen systémové
      const result = await service.getUnreadCount('recipient1');
      expect(result).toEqual({ unreadCount: 5, systemUnread: 2 });
    });
  });

  describe('getConversation', () => {
    it('vrátí vlákno, filtruje zprávy smazané pro uživatele', async () => {
      msgRepo.findConversation.mockResolvedValue([
        makeMsg({ id: 'm1', recipientId: 'u1', senderId: 'u2' }),
        makeMsg({
          id: 'm2',
          recipientId: 'u1',
          senderId: 'u2',
          deletedByRecipient: true,
        }),
      ]);
      const result = await service.getConversation('conv1', 'u1');
      expect(result.map((m) => m.id)).toEqual(['m1']);
    });

    it('403 pro cizího uživatele', async () => {
      msgRepo.findConversation.mockResolvedValue([
        makeMsg({ senderId: 'a', recipientId: 'b' }),
      ]);
      await expect(service.getConversation('conv1', 'cizi')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('404 pro prázdné vlákno', async () => {
      msgRepo.findConversation.mockResolvedValue([]);
      await expect(service.getConversation('conv1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getById', () => {
    it('označí zprávu jako přečtenou pokud je volající recipient', async () => {
      const msg = makeMsg({ recipientId: 'u1', isRead: false });
      msgRepo.findById.mockResolvedValue(msg);
      msgRepo.update.mockResolvedValue({ ...msg, isRead: true });
      await service.getById('msg1', 'u1');
      expect(msgRepo.update).toHaveBeenCalledWith('msg1', { isRead: true });
    });

    it('403 pro cizího uživatele', async () => {
      msgRepo.findById.mockResolvedValue(makeMsg());
      await expect(service.getById('msg1', 'cizi')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('softDelete', () => {
    it('nastaví deletedByRecipient pokud je volající recipient', async () => {
      const msg = makeMsg({ recipientId: 'u1' });
      msgRepo.findById.mockResolvedValue(msg);
      msgRepo.update.mockResolvedValue({ ...msg, deletedByRecipient: true });
      await service.softDelete('msg1', 'u1');
      expect(msgRepo.update).toHaveBeenCalledWith('msg1', {
        deletedByRecipient: true,
      });
    });

    it('nastaví deletedBySender pokud je volající sender', async () => {
      const msg = makeMsg({ senderId: 'u2' });
      msgRepo.findById.mockResolvedValue(msg);
      msgRepo.update.mockResolvedValue({ ...msg, deletedBySender: true });
      await service.softDelete('msg1', 'u2');
      expect(msgRepo.update).toHaveBeenCalledWith('msg1', {
        deletedBySender: true,
      });
    });

    it('403 pro cizího uživatele', async () => {
      msgRepo.findById.mockResolvedValue(makeMsg());
      await expect(service.softDelete('msg1', 'cizi')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
