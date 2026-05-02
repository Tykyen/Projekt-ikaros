import {
  Injectable, Inject, NotFoundException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { IIkarosMessagesRepository } from './interfaces/ikaros-messages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IkarosMessage } from './interfaces/ikaros-message.interface';
import type { CreateIkarosMessageDto } from './dto/create-ikaros-message.dto';
import type { ResolveIkarosMessageDto } from './dto/resolve-ikaros-message.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

interface SenderRef { id: string; username: string }

interface JoinRequestedPayload {
  worldId: string;
  worldName: string;
  requesterId: string;
  requesterName: string;
}

@Injectable()
export class IkarosMessagesService {
  constructor(
    @Inject('IIkarosMessagesRepository') private readonly msgRepo: IIkarosMessagesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateIkarosMessageDto, sender: SenderRef): Promise<IkarosMessage> {
    const msg = await this.msgRepo.save({
      senderId: sender.id,
      senderName: sender.username,
      recipientId: dto.recipientId,
      recipientName: dto.recipientName,
      subject: dto.subject,
      body: dto.body,
      sentAtUtc: new Date(),
      isRead: false,
      deletedBySender: false,
      deletedByRecipient: false,
      actionType: '',
      actionResolved: false,
    });
    this.eventEmitter.emit('ikaros.message.created', {
      recipientId: msg.recipientId,
      messageId: msg.id,
      subject: msg.subject,
      senderName: msg.senderName,
      actionType: msg.actionType,
    });
    return msg;
  }

  async getInbox(recipientId: string, limit = 50, before?: string): Promise<IkarosMessage[]> {
    return this.msgRepo.findInbox(recipientId, { limit: Math.min(limit, 100), before });
  }

  async getSent(senderId: string, limit = 50, before?: string): Promise<IkarosMessage[]> {
    return this.msgRepo.findSent(senderId, { limit: Math.min(limit, 100), before });
  }

  async getUnreadCount(recipientId: string): Promise<{ messages: number; pendingRequests: number }> {
    const [messages, pendingRequests] = await Promise.all([
      this.msgRepo.countUnreadMessages(recipientId),
      this.msgRepo.countPendingRequests(recipientId),
    ]);
    return { messages, pendingRequests };
  }

  async getById(id: string, userId: string): Promise<IkarosMessage> {
    const msg = await this.msgRepo.findById(id);
    if (!msg) throw new NotFoundException('Zpráva nenalezena');
    if (msg.recipientId !== userId && msg.senderId !== userId) {
      throw new ForbiddenException('Přístup odepřen');
    }
    if (msg.recipientId === userId && !msg.isRead) {
      await this.msgRepo.update(id, { isRead: true });
    }
    return msg;
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const msg = await this.msgRepo.findById(id);
    if (!msg) throw new NotFoundException('Zpráva nenalezena');
    if (msg.recipientId === userId) {
      await this.msgRepo.update(id, { deletedByRecipient: true });
    } else if (msg.senderId === userId) {
      await this.msgRepo.update(id, { deletedBySender: true });
    } else {
      throw new ForbiddenException('Přístup odepřen');
    }
  }

  async resolve(id: string, dto: ResolveIkarosMessageDto, userId: string): Promise<void> {
    const msg = await this.msgRepo.findById(id);
    if (!msg) throw new NotFoundException('Zpráva nenalezena');
    if (msg.recipientId !== userId) throw new ForbiddenException('Přístup odepřen');
    if (msg.actionType !== 'world_join_request') {
      throw new ForbiddenException('Zpráva není žádost o vstup');
    }
    if (msg.actionResolved) throw new ConflictException('Žádost již byla vyřízena');

    await this.msgRepo.update(id, { actionResolved: true, isRead: true });

    if (dto.accept) {
      const membership = await this.membershipRepo.findByUserAndWorld(msg.actionUserId!, msg.actionWorldId!);
      if (membership && membership.role === WorldRole.Pending) {
        await this.membershipRepo.update(membership.id, { role: WorldRole.Hrac });
        this.eventEmitter.emit('world.membership.changed', { worldId: msg.actionWorldId, membership });
      }
      await this.msgRepo.save({
        senderId: userId,
        senderName: 'Systém',
        recipientId: msg.actionUserId!,
        recipientName: '',
        subject: 'Žádost o vstup přijata',
        body: 'Tvoje žádost o vstup do světa byla přijata.',
        sentAtUtc: new Date(),
        isRead: false,
        deletedBySender: false,
        deletedByRecipient: false,
        actionType: '',
        actionResolved: false,
      });
    } else {
      const reason = dto.reason?.trim() || 'byl jsi odmítnut';
      await this.msgRepo.save({
        senderId: userId,
        senderName: 'Systém',
        recipientId: msg.actionUserId!,
        recipientName: '',
        subject: 'Žádost o vstup zamítnuta',
        body: reason,
        sentAtUtc: new Date(),
        isRead: false,
        deletedBySender: false,
        deletedByRecipient: false,
        actionType: '',
        actionResolved: false,
      });
    }
  }

  @OnEvent('world.join.requested')
  async handleJoinRequest(payload: JoinRequestedPayload): Promise<void> {
    const memberships = await this.membershipRepo.findByWorldId(payload.worldId);
    const pjs = memberships.filter(
      (m) => m.role === WorldRole.PJ || m.role === WorldRole.PomocnyPJ,
    );
    await Promise.all(
      pjs.map((pj) =>
        this.msgRepo.save({
          senderId: payload.requesterId,
          senderName: payload.requesterName,
          recipientId: pj.userId,
          recipientName: '',
          subject: `Žádost o vstup do světa ${payload.worldName}`,
          body: `Uživatel ${payload.requesterName} žádá o vstup do světa ${payload.worldName}.`,
          sentAtUtc: new Date(),
          isRead: false,
          deletedBySender: false,
          deletedByRecipient: false,
          actionType: 'world_join_request',
          actionWorldId: payload.worldId,
          actionUserId: payload.requesterId,
          actionResolved: false,
        }).then((msg) => {
          this.eventEmitter.emit('ikaros.message.created', {
            recipientId: pj.userId,
            messageId: msg.id,
            subject: msg.subject,
            senderName: msg.senderName,
            actionType: msg.actionType,
          });
        }),
      ),
    );
  }
}
