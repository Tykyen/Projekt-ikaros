import { IkarosMessage } from './ikaros-message.interface';

export interface IIkarosMessagesRepository {
  findById(id: string): Promise<IkarosMessage | null>;
  findInbox(recipientId: string, opts: { limit: number; before?: string }): Promise<IkarosMessage[]>;
  findSent(senderId: string, opts: { limit: number; before?: string }): Promise<IkarosMessage[]>;
  countUnreadMessages(recipientId: string): Promise<number>;
  countPendingRequests(recipientId: string): Promise<number>;
  save(msg: Partial<IkarosMessage>): Promise<IkarosMessage>;
  update(id: string, data: Partial<IkarosMessage>): Promise<IkarosMessage | null>;
  resolveIfPending(id: string): Promise<boolean>;
}
