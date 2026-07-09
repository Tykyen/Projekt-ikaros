import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ContentReportSchemaClass,
  ContentReportSchema,
} from './schemas/content-report.schema';
import {
  ModerationDecisionSchemaClass,
  ModerationDecisionSchema,
} from './schemas/moderation-decision.schema';
import {
  ModerationAppealSchemaClass,
  ModerationAppealSchema,
} from './schemas/moderation-appeal.schema';
import { MongoContentReportsRepository } from './repositories/content-reports.repository';
import { MongoModerationDecisionsRepository } from './repositories/moderation-decisions.repository';
import { MongoModerationAppealsRepository } from './repositories/moderation-appeals.repository';
import { ContentReportProvider } from './providers/content-report.provider';
import { AppealReviewProvider } from './providers/appeal-review.provider';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
// B3 — in-app oznámení (Pošta/notifikační centrum). MailerService je @Global.
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';

/**
 * Spec 20B (Fáze B1) — modul `moderation`: generický report intake, fronta
 * (přes pending-actions), reporter status, základní resolve do moderačního logu.
 * B4d — diskuzní nahlašování bylo sjednoceno sem (legacy `ikaros_discussion_reports`
 * zmigrováno do `content_reports`, kód dual-systému odstraněn; legacy kolekce
 * zůstává jako audit stopa).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContentReportSchemaClass.name, schema: ContentReportSchema },
      {
        name: ModerationDecisionSchemaClass.name,
        schema: ModerationDecisionSchema,
      },
      {
        name: ModerationAppealSchemaClass.name,
        schema: ModerationAppealSchema,
      },
    ]),
    IkarosMessagesModule,
  ],
  controllers: [ModerationController],
  providers: [
    ModerationService,
    ContentReportProvider,
    AppealReviewProvider,
    {
      provide: 'IContentReportsRepository',
      useClass: MongoContentReportsRepository,
    },
    {
      provide: 'IModerationDecisionsRepository',
      useClass: MongoModerationDecisionsRepository,
    },
    {
      provide: 'IModerationAppealsRepository',
      useClass: MongoModerationAppealsRepository,
    },
  ],
})
export class ModerationModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly contentReportProvider: ContentReportProvider,
    private readonly appealReviewProvider: AppealReviewProvider,
  ) {}

  /**
   * Registrace queue typů `content_report` (B1) a `moderation_appeal` (B4a)
   * v globální PendingActionsService.
   */
  onModuleInit() {
    this.pendingActions.register(this.contentReportProvider);
    this.pendingActions.register(this.appealReviewProvider);
  }
}
