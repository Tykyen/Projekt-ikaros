import { Global, Module } from '@nestjs/common';
import { AlertService } from './alert.service';

/**
 * Monitoring alert kanál (3. noha). @Global → `AlertService` injektovatelný
 * kdekoli (health-cron, exception filter, auth) bez explicitního importu.
 */
@Global()
@Module({
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
