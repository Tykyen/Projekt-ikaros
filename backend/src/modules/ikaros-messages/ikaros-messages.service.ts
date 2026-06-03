import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IIkarosMessagesRepository } from './interfaces/ikaros-messages-repository.interface';
import type { IkarosMessage } from './interfaces/ikaros-message.interface';
import type { CreateIkarosMessageDto } from './dto/create-ikaros-message.dto';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { IFriendshipsRepository } from '../friendships/interfaces/friendships-repository.interface';

interface SenderRef {
  id: string;
  username: string;
  /**
   * Role odesílatele. Vyplněna jen u uživatelského endpointu (controller).
   * Interní/systémoví volající (články, galerie, diskuze) ji nepředávají —
   * jejich notifikační zprávy obcházejí D-057 friend-only check.
   */
  role?: UserRole;
}

@Injectable()
export class IkarosMessagesService {
  constructor(
    @Inject('IIkarosMessagesRepository')
    private readonly msgRepo: IIkarosMessagesRepository,
    private readonly usersService: UsersService,
    @Inject('IFriendshipsRepository')
    private readonly friendsRepo: IFriendshipsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    dto: CreateIkarosMessageDto,
    sender: SenderRef,
  ): Promise<IkarosMessage> {
    let conversationId = '';
    let replyToId: string | undefined;

    if (dto.replyToId) {
      // Odpověď ve vlákně — ověř rodiče a účast odesílatele.
      const parent = await this.msgRepo.findById(dto.replyToId);
      if (!parent)
        throw new NotFoundException({
          code: 'IKAROS_MESSAGE_NOT_FOUND',
          message: 'Rodičovská zpráva nenalezena',
        });
      if (parent.senderId !== sender.id && parent.recipientId !== sender.id)
        throw new ForbiddenException({
          code: 'IKAROS_MESSAGE_ACCESS_DENIED',
          message: 'Nejsi účastníkem této konverzace',
        });
      conversationId = parent.conversationId || parent.id;
      replyToId = parent.id;
    } else if (sender.role !== undefined) {
      // Nové vlákno přes uživatelský endpoint — D-057 friend-only check.
      // Systémoví volající (bez role) check obcházejí.
      await this.assertCanMessageRecipient(sender, dto.recipientId);
    }

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
      conversationId,
      replyToId,
    });

    if (!conversationId) {
      // Kořen vlákna — conversationId = vlastní _id.
      await this.msgRepo.update(msg.id, { conversationId: msg.id });
      msg.conversationId = msg.id;
    }

    this.eventEmitter.emit('ikaros.message.created', {
      recipientId: msg.recipientId,
      messageId: msg.id,
      subject: msg.subject,
      senderName: msg.senderName,
      // N-33 — příznak systémové pošty; FE záložka „Události" pak invaliduje
      // jen při systémové zprávě, ne při každé běžné poště (zbytečné refetchy).
      system: msg.senderId === 'system',
    });
    return msg;
  }

  /** D-057 — pokud příjemce přijímá zprávy jen od přátel, ověř friendship. */
  private async assertCanMessageRecipient(
    sender: SenderRef,
    recipientId: string,
  ): Promise<void> {
    const senderIsAdmin =
      sender.role === UserRole.Admin || sender.role === UserRole.Superadmin;
    if (senderIsAdmin || sender.id === recipientId) return;

    const recipient = await this.usersService.findById(recipientId);
    if (recipient.profileVisibility !== 'friends') return;

    const friendship = await this.friendsRepo.findActiveBetween(
      sender.id,
      recipientId,
    );
    if (friendship?.status !== 'accepted')
      throw new ForbiddenException({
        code: 'RECIPIENT_FRIENDS_ONLY',
        message: 'Tento uživatel přijímá zprávy jen od přátel',
      });
  }

  async getInbox(
    recipientId: string,
    limit = 50,
    before?: string,
    systemOnly = false,
  ): Promise<IkarosMessage[]> {
    return this.msgRepo.findInbox(recipientId, {
      limit: Math.min(limit, 100),
      before,
      systemOnly,
    });
  }

  async getSent(
    senderId: string,
    limit = 50,
    before?: string,
  ): Promise<IkarosMessage[]> {
    return this.msgRepo.findSent(senderId, {
      limit: Math.min(limit, 100),
      before,
    });
  }

  async getUnreadCount(
    recipientId: string,
  ): Promise<{ unreadCount: number; systemUnread: number }> {
    const [unreadCount, systemUnread] = await Promise.all([
      this.msgRepo.countUnreadMessages(recipientId),
      this.msgRepo.countUnreadMessages(recipientId, true),
    ]);
    // 13.2b — `systemUnread` = nepřečtená systémová oznámení (badge u zvonku).
    return { unreadCount, systemUnread };
  }

  async getById(id: string, userId: string): Promise<IkarosMessage> {
    const msg = await this.msgRepo.findById(id);
    if (!msg)
      throw new NotFoundException({
        code: 'IKAROS_MESSAGE_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });
    if (msg.recipientId !== userId && msg.senderId !== userId) {
      throw new ForbiddenException({
        code: 'IKAROS_MESSAGE_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    if (msg.recipientId === userId && !msg.isRead) {
      await this.msgRepo.update(id, { isRead: true });
    }
    return msg;
  }

  /** 3.5 — celé vlákno konverzace, vzestupně. 403 pro cizí účastníky. */
  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<IkarosMessage[]> {
    const msgs = await this.msgRepo.findConversation(conversationId);
    if (msgs.length === 0)
      throw new NotFoundException({
        code: 'IKAROS_CONVERSATION_NOT_FOUND',
        message: 'Konverzace nenalezena',
      });
    const isParticipant = msgs.some(
      (m) => m.senderId === userId || m.recipientId === userId,
    );
    if (!isParticipant)
      throw new ForbiddenException({
        code: 'IKAROS_MESSAGE_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    return msgs.filter(
      (m) =>
        !(m.recipientId === userId && m.deletedByRecipient) &&
        !(m.senderId === userId && m.deletedBySender),
    );
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const msg = await this.msgRepo.findById(id);
    if (!msg)
      throw new NotFoundException({
        code: 'IKAROS_MESSAGE_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });
    if (msg.recipientId === userId) {
      await this.msgRepo.update(id, { deletedByRecipient: true });
    } else if (msg.senderId === userId) {
      await this.msgRepo.update(id, { deletedBySender: true });
    } else {
      throw new ForbiddenException({
        code: 'IKAROS_MESSAGE_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
  }
}
