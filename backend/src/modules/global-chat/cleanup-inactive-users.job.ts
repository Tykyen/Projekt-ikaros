import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GlobalChatGateway } from './global-chat.gateway';

@Injectable()
export class CleanupInactiveUsersJob {
  private readonly logger = new Logger(CleanupInactiveUsersJob.name);
  private static readonly THRESHOLD_MS = 60 * 60 * 1000;

  constructor(private readonly gateway: GlobalChatGateway) {}

  @Cron(CronExpression.EVERY_HOUR)
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
