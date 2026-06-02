import type { ScheduledMessage } from './scheduled-message.interface';

export interface IScheduledMessageRepository {
  create(data: Partial<ScheduledMessage>): Promise<ScheduledMessage>;
  /** Pending zprávy se `sendAt <= now` (k odeslání). */
  findDue(now: Date, limit?: number): Promise<ScheduledMessage[]>;
  /** Pending zprávy ownera v daném světě (fronta v UI). */
  findPendingByOwner(
    ownerId: string,
    worldId: string,
  ): Promise<ScheduledMessage[]>;
  findById(id: string): Promise<ScheduledMessage | null>;
  setStatus(id: string, status: ScheduledMessage['status']): Promise<void>;
  delete(id: string): Promise<boolean>;
}
