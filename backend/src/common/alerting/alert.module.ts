import { Global, Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { BruteForceMonitor } from './brute-force.monitor';

/**
 * Monitoring alert kanál (3. noha). @Global → `AlertService` + `BruteForceMonitor`
 * injektovatelné kdekoli (health-cron, exception filter) bez explicitního importu.
 */
@Global()
@Module({
  providers: [AlertService, BruteForceMonitor],
  exports: [AlertService, BruteForceMonitor],
})
export class AlertModule {}
