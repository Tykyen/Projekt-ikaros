import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosDiscussionSchemaClass,
  IkarosDiscussionSchema,
} from './schemas/ikaros-discussion.schema';
import {
  IkarosDiscussionPostSchemaClass,
  IkarosDiscussionPostSchema,
} from './schemas/ikaros-discussion-post.schema';
import { MongoIkarosDiscussionsRepository } from './repositories/ikaros-discussions.repository';
import { MongoIkarosDiscussionPostsRepository } from './repositories/ikaros-discussion-posts.repository';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
import { IkarosDiscussionsController } from './ikaros-discussions.controller';
import { DiscussionReviewProvider } from './providers/discussion-review.provider';
import { DiscussionJoinProvider } from './providers/discussion-join.provider';
import { DiscussionsModerationEnforcementListener } from './moderation-enforcement.listener';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';
import { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: IkarosDiscussionSchemaClass.name,
        schema: IkarosDiscussionSchema,
      },
      {
        name: IkarosDiscussionPostSchemaClass.name,
        schema: IkarosDiscussionPostSchema,
      },
    ]),
    IkarosMessagesModule,
  ],
  controllers: [IkarosDiscussionsController],
  providers: [
    IkarosDiscussionsService,
    DiscussionReviewProvider,
    DiscussionJoinProvider,
    // B4d — vynucení moderačních zásahů nad příspěvky (skrytí M2/M3, smazání M4).
    DiscussionsModerationEnforcementListener,
    {
      provide: 'IIkarosDiscussionsRepository',
      useClass: MongoIkarosDiscussionsRepository,
    },
    {
      provide: 'IIkarosDiscussionPostsRepository',
      useClass: MongoIkarosDiscussionPostsRepository,
    },
    { provide: 'IkarosMessagesService', useExisting: IkarosMessagesService },
  ],
  // 12.1 — admin dashboard agregace (countAll).
  exports: ['IIkarosDiscussionsRepository'],
})
export class IkarosDiscussionsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: DiscussionReviewProvider,
    private readonly joinProvider: DiscussionJoinProvider,
  ) {}

  /**
   * Spec 3.4 §7 — registrace queue typů diskuzí v globální
   * `PendingActionsService`: discussion_pending_review / discussion_join_request.
   * B4d — `discussion_report` byl sjednocen do generického `content_report`
   * (modul `moderation`), vlastní provider už neexistuje.
   */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
    this.pendingActions.register(this.joinProvider);
  }
}
