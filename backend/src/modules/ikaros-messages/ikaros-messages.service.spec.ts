import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IkarosMessagesService } from './ikaros-messages.service';
import type { IIkarosMessagesRepository } from './interfaces/ikaros-messages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IkarosMessage } from './interfaces/ikaros-message.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

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
  actionType: '',
  actionResolved: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('IkarosMessagesService', () => {
  let service: IkarosMessagesService;
  let msgRepo: jest.Mocked<IIkarosMessagesRepository>;
  let membershipRepo: jest.Mocked<IWorldMembershipRepository>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    msgRepo = {
      findById: jest.fn(),
      findInbox: jest.fn(),
      findSent: jest.fn(),
      countUnreadMessages: jest.fn(),
      countPendingRequests: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      resolveIfPending: jest.fn(),
    } as jest.Mocked<IIkarosMessagesRepository>;

    membershipRepo = {
      findByWorldId: jest.fn(),
      findByUserAndWorld: jest.fn(),
      findByUserId: jest.fn(),
      findById: jest.fn(),
      countByWorldId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IWorldMembershipRepository>;

    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    const module = await Test.createTestingModule({
      providers: [
        IkarosMessagesService,
        { provide: 'IIkarosMessagesRepository', useValue: msgRepo },
        { provide: 'IWorldMembershipRepository', useValue: membershipRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(IkarosMessagesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('uloží zprávu a emituje event', async () => {
      const saved = makeMsg();
      msgRepo.save.mockResolvedValue(saved);
      const result = await service.create(
        { subject: 'Ahoj', body: 'Jak se máš?', recipientId: 'recipient1', recipientName: 'Bob' },
        { id: 'sender1', username: 'Alice' },
      );
      expect(result.senderId).toBe('sender1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('ikaros.message.created', expect.objectContaining({
        recipientId: 'recipient1',
        messageId: saved.id,
      }));
    });
  });

  describe('getUnreadCount', () => {
    it('vrátí messages a pendingRequests', async () => {
      msgRepo.countUnreadMessages.mockResolvedValue(3);
      msgRepo.countPendingRequests.mockResolvedValue(1);
      const result = await service.getUnreadCount('recipient1');
      expect(result).toEqual({ messages: 3, pendingRequests: 1 });
    });
  });

  describe('softDelete', () => {
    it('nastaví deletedByRecipient pokud je volající recipient', async () => {
      const msg = makeMsg({ recipientId: 'u1' });
      msgRepo.findById.mockResolvedValue(msg);
      msgRepo.update.mockResolvedValue({ ...msg, deletedByRecipient: true });
      await service.softDelete('msg1', 'u1');
      expect(msgRepo.update).toHaveBeenCalledWith('msg1', { deletedByRecipient: true });
    });

    it('nastaví deletedBySender pokud je volající sender', async () => {
      const msg = makeMsg({ senderId: 'u2' });
      msgRepo.findById.mockResolvedValue(msg);
      msgRepo.update.mockResolvedValue({ ...msg, deletedBySender: true });
      await service.softDelete('msg1', 'u2');
      expect(msgRepo.update).toHaveBeenCalledWith('msg1', { deletedBySender: true });
    });

    it('hodí ForbiddenException pro cizího uživatele', async () => {
      msgRepo.findById.mockResolvedValue(makeMsg());
      await expect(service.softDelete('msg1', 'cizi')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resolve', () => {
    it('hodí ConflictException pokud resolveIfPending vrátí false', async () => {
      msgRepo.findById.mockResolvedValue(makeMsg({
        recipientId: 'pj1',
        actionType: 'world_join_request',
        actionResolved: true,
        actionWorldId: 'w1',
        actionUserId: 'req1',
      }));
      msgRepo.resolveIfPending.mockResolvedValue(false);
      await expect(service.resolve('msg1', { accept: true }, 'pj1')).rejects.toThrow(ConflictException);
    });

    it('hodí ForbiddenException pokud volající není recipient', async () => {
      msgRepo.findById.mockResolvedValue(makeMsg({
        recipientId: 'pj1',
        actionType: 'world_join_request',
        actionResolved: false,
      }));
      await expect(service.resolve('msg1', { accept: true }, 'jiny')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleJoinRequest', () => {
    it('vytvoří zprávu pro každého PJ a PomocnyPJ světa', async () => {
      membershipRepo.findByWorldId.mockResolvedValue([
        { id: 'm1', userId: 'pj1', worldId: 'w1', role: WorldRole.PJ, joinedAt: new Date(), akj: 0 },
        { id: 'm2', userId: 'pj2', worldId: 'w1', role: WorldRole.PomocnyPJ, joinedAt: new Date(), akj: 0 },
        { id: 'm3', userId: 'hrac1', worldId: 'w1', role: WorldRole.Hrac, joinedAt: new Date(), akj: 0 },
      ]);
      msgRepo.save.mockResolvedValue(makeMsg());

      await service.handleJoinRequest({
        worldId: 'w1',
        worldName: 'Matrix',
        requesterId: 'req1',
        requesterName: 'Frodo',
      });

      expect(msgRepo.save).toHaveBeenCalledTimes(2);
      const calls = msgRepo.save.mock.calls;
      expect(calls[0][0]).toMatchObject({ recipientId: 'pj1', actionType: 'world_join_request' });
      expect(calls[1][0]).toMatchObject({ recipientId: 'pj2', actionType: 'world_join_request' });
    });
  });
});
