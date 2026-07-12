import type { ScheduledMessage } from './scheduled-message.interface';

export interface IScheduledMessageRepository {
  create(data: Partial<ScheduledMessage>): Promise<ScheduledMessage>;
  /**
   * Atomicky claimne dávku zpráv k odeslání (`pending` + `sendAt <= now`,
   * plus stale `sending` starší než recovery timeout) — každou flipne na
   * `sending` přes `findOneAndUpdate`, takže souběžný cron druhé instance
   * tutéž zprávu nedostane (dřív read-then-set = dvojí odeslání).
   */
  claimDue(now: Date, limit?: number): Promise<ScheduledMessage[]>;
  /** Pending zprávy ownera v daném světě (fronta v UI). */
  findPendingByOwner(
    ownerId: string,
    worldId: string,
  ): Promise<ScheduledMessage[]>;
  findById(id: string): Promise<ScheduledMessage | null>;
  setStatus(id: string, status: ScheduledMessage['status']): Promise<void>;
  delete(id: string): Promise<boolean>;
}
