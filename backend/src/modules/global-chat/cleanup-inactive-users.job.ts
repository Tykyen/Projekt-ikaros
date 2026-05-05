import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GlobalChatGateway } from './global-chat.gateway';

@Injectable()
export class CleanupInactiveUsersJob {
  private readonly logger = new Logger(CleanupInactiveUsersJob.name);
  private static readonly THRESHOLD_MS = 45 * 60 * 1000;

  constructor(private readonly gateway: GlobalChatGateway) {}

  @Cron('0 */45 * * * *')
  cleanup(): void {
    try {
      const removed = this.gateway.cleanupInactive(CleanupInactiveUsersJob.THRESHOLD_MS);
      if (removed > 0) {
        this.logger.log(`CleanupInactiveUsers: odpojeno ${removed} neaktivních uživatelů`);
      }
    } catch (err) {
      this.logger.error('CleanupInactiveUsers: chyba', err);
    }
  }
}
