import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BugReportSchemaClass,
  BugReportSchema,
} from './schemas/bug-report.schema';
import { MongoBugReportsRepository } from './repositories/bug-reports.repository';
import { BugReportsService } from './bug-reports.service';
import { BugReportsController } from './bug-reports.controller';

/**
 * Spec 25.1 — modul `bug-reports`: in-app hlášení chyb (kanál Vypravěč).
 * Oddělená entita od `moderation` (bug ≠ obsahová moderace). Discord notifikace
 * přes globální AlertService (žádný import navíc).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BugReportSchemaClass.name, schema: BugReportSchema },
    ]),
  ],
  controllers: [BugReportsController],
  providers: [
    BugReportsService,
    {
      provide: 'IBugReportsRepository',
      useClass: MongoBugReportsRepository,
    },
  ],
})
export class BugReportsModule {}
