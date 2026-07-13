/**
 * 21.5e — Items modul (předměty, komunitní katalog). Mirror spells.module
 * (21.5c). JwtAuthGuard se resolvne z globálních modulů, AuthModule netřeba.
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemSchema, ItemSchemaClass } from './schemas/item.schema';
import {
  ItemCommentSchema,
  ItemCommentSchemaClass,
} from './schemas/item-comment.schema';
import { ItemsRepository } from './repositories/items.repository';
import { ItemCommentsRepository } from './repositories/item-comments.repository';
import { ItemsService } from './items.service';
import { ItemCommentsService } from './item-comments.service';
import { ItemsController } from './items.controller';
import { CommunityItemReviewProvider } from './community-item-review.provider';
import { ItemsModerationEnforcementListener } from './moderation-enforcement.listener';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ItemSchemaClass.name, schema: ItemSchema },
      { name: ItemCommentSchemaClass.name, schema: ItemCommentSchema },
    ]),
  ],
  controllers: [ItemsController],
  providers: [
    ItemsRepository,
    ItemCommentsRepository,
    ItemsService,
    ItemCommentsService,
    // 21.5e — pending fronta „předměty ke schválení".
    CommunityItemReviewProvider,
    // Enforcement moderace 20B (skrýt/smazat předmět).
    ItemsModerationEnforcementListener,
  ],
  exports: [ItemsService],
})
export class ItemsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: CommunityItemReviewProvider,
  ) {}

  /** 21.5e — registrace review provideru v globální PendingActionsService. */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
