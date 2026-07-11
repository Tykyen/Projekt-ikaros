import { Module } from '@nestjs/common';
import { HealthMonitorService } from './health-monitor.service';

/**
 * Monitoring (3. noha) — periodický health-cron (alert při pádu závislosti).
 * Redis/Mongo/AlertService jsou @Global; ScheduleModule je registrován v AppModule.
 */
@Module({
  providers: [HealthMonitorService],
})
export class HealthModule {}
