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
  status: 'pending' | 'sent' | 'failed';
  createdAt?: Date;
  updatedAt?: Date;
}
