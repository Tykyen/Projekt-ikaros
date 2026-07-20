import { Module } from '@nestjs/common';
import { CspReportController } from './csp-report.controller';
import { CspReportService } from './csp-report.service';

/** 24.2 — sběr porušení CSP z FE nginxu (`report-uri` + `report-to`). */
@Module({
  controllers: [CspReportController],
  providers: [CspReportService],
})
export class CspReportModule {}
