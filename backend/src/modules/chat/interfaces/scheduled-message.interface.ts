import type { UserRole } from '../../users/interfaces/user.interface';

/**
 * 11.2-ext F — naplánovaná zpráva do světového chatu. @Cron worker ji v čas
 * `sendAt` odešle jménem ownera (uložené `ownerId/Name/Role` → RequestUser).
 */
export interface ScheduledMessage {
  id: string;
  worldId: string;
  channelId: string;
  /** Odesílatel — worker pošle zprávu jeho jménem. */
  ownerId: string;
  ownerName: string;
  ownerRole: UserRole;
  content?: string;
  attachments?: unknown[];
  sendAt: Date;
  /**
   * `sending` = atomicky claimnutá cronem (brání dvojímu odeslání při 2+
   * replikách); stale `sending` (pád procesu mid-send) se po timeoutu
   * re-claimne.
   */
  status: 'pending' | 'sending' | 'sent' | 'failed';
  createdAt?: Date;
  updatedAt?: Date;
}
