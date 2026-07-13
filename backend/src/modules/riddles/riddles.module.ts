/**
 * 21.5d — Riddles modul (hádanky, komunitní katalog). Vzor: plants.module +
 * jednoúrovňové komentáře. JwtAuthGuard se resolvne z globálních modulů.
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RiddleSchema, RiddleSchemaClass } from './schemas/riddle.schema';
import {
  RiddleCommentSchema,
  RiddleCommentSchemaClass,
} from './schemas/riddle-comment.schema';
import { RiddlesRepository } from './repositories/riddles.repository';
import { RiddleCommentsRepository } from './repositories/riddle-comments.repository';
import { RiddlesService } from './riddles.service';
import { RiddleCommentsService } from './riddle-comments.service';
import { RiddlesController } from './riddles.controller';
import { CommunityRiddleReviewProvider } from './community-riddle-review.provider';
import { RiddlesModerationEnforcementListener } from './moderation-enforcement.listener';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RiddleSchemaClass.name, schema: RiddleSchema },
      { name: RiddleCommentSchemaClass.name, schema: RiddleCommentSchema },
    ]),
  ],
  controllers: [RiddlesController],
  providers: [
    RiddlesRepository,
    RiddleCommentsRepository,
    RiddlesService,
    RiddleCommentsService,
    // 21.5d — pending fronta „hádanky ke schválení".
    CommunityRiddleReviewProvider,
    // Enforcement moderace 20B (skrýt/smazat hádanku).
    RiddlesModerationEnforcementListener,
  ],
  exports: [RiddlesService],
})
export class RiddlesModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: CommunityRiddleReviewProvider,
  ) {}

  /** 21.5d — registrace review provideru v globální PendingActionsService. */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
