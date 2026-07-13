import { Injectable, Logger } from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GlobalChatGateway } from './global-chat.gateway';
import { HOUR_MS } from '../../common/constants/time.constants';

@Injectable()
export class CleanupInactiveUsersJob {
  private readonly logger = new Logger(CleanupInactiveUsersJob.name);
  private static readonly THRESHOLD_MS = HOUR_MS;

  constructor(private readonly gateway: GlobalChatGateway) {}

  // Threshold je 60 min, ale kontrolujeme po 5 min — jinak by se reálné
  // odpojení rozjelo na 60–120 min podle fáze hodinového cronu.
  // Bez CronLock (záměrně) — čistí per-instance in-memory presence gatewaye;
  // při 2+ replikách musí běžet na KAŽDÉ (lock by nechal ghost presence).
  @Cron(CronExpression.EVERY_5_MINUTES)
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
      logError(this.logger, 'CleanupInactiveUsers: chyba', err);
    }
  }
}
