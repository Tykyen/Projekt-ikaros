import { IkarosMessage } from './ikaros-message.interface';

export interface IIkarosMessagesRepository {
  findById(id: string): Promise<IkarosMessage | null>;
  findInbox(
    recipientId: string,
    opts: { limit: number; before?: string; systemOnly?: boolean },
  ): Promise<IkarosMessage[]>;
  findSent(
    senderId: string,
    opts: { limit: number; before?: string },
  ): Promise<IkarosMessage[]>;
  /** 3.5 — všechny zprávy vlákna, vzestupně dle sentAtUtc. */
  findConversation(conversationId: string): Promise<IkarosMessage[]>;
  /** 13.2b — `systemOnly` počítá jen systémová oznámení (záložka Události). */
  countUnreadMessages(
    recipientId: string,
    systemOnly?: boolean,
  ): Promise<number>;
  save(msg: Partial<IkarosMessage>): Promise<IkarosMessage>;
  update(
    id: string,
    data: Partial<IkarosMessage>,
  ): Promise<IkarosMessage | null>;
  /** GDPR — hard-delete účtu: anonymizuj jméno odesílatele/příjemce v DM. */
  anonymizeByUser(userId: string): Promise<void>;
}
