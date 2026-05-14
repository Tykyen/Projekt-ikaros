import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GlobalChatGateway } from './global-chat.gateway';
import { HOUR_MS } from '../../common/constants/time.constants';

@Injectable()
export class CleanupInactiveUsersJob {
  private readonly logger = new Logger(CleanupInactiveUsersJob.name);
  private static readonly THRESHOLD_MS = HOUR_MS;

  constructor(private readonly gateway: GlobalChatGateway) {}

  @Cron(CronExpression.EVERY_HOUR)
  cleanup(): void {
    try {
      const removed = this.gateway.cleanupInactive(
        CleanupInactiveUsersJob.THRESHOLD_MS,
      );
      if (removed > 0) {
        this.logger.log(
          `CleanupInactiveUsers: odpojeno ${removed} neaktivních uživatelů`,
        );
      }
    } catch (err) {
      this.logger.error('CleanupInactiveUsers: chyba', err);
    }
  }
}
