/**
 * 21.5f — PriceLists modul (ceníky, komunitní knihovna). Vzor: plants.module +
 * komentářová část z items.module. Jen community scope, žádný gateway.
 * JwtAuthGuard se resolvne z globálních modulů — AuthModule netřeba importovat.
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PriceListSchema,
  PriceListSchemaClass,
} from './schemas/price-list.schema';
import {
  PriceListCommentSchema,
  PriceListCommentSchemaClass,
} from './schemas/price-list-comment.schema';
import { PriceListsRepository } from './repositories/price-lists.repository';
import { PriceListCommentsRepository } from './repositories/price-list-comments.repository';
import { PriceListsService } from './price-lists.service';
import { PriceListCommentsService } from './price-list-comments.service';
import { PriceListsController } from './price-lists.controller';
import { CommunityPriceListReviewProvider } from './community-price-list-review.provider';
import { PriceListsModerationEnforcementListener } from './moderation-enforcement.listener';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PriceListSchemaClass.name, schema: PriceListSchema },
      {
        name: PriceListCommentSchemaClass.name,
        schema: PriceListCommentSchema,
      },
    ]),
  ],
  controllers: [PriceListsController],
  providers: [
    PriceListsRepository,
    PriceListCommentsRepository,
    PriceListsService,
    PriceListCommentsService,
    // 21.5f — pending fronta „ceníky ke schválení".
    CommunityPriceListReviewProvider,
    // Spec 20B — enforcement moderace (skrýt/smazat ceník).
    PriceListsModerationEnforcementListener,
  ],
  exports: [PriceListsService],
})
export class PriceListsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: CommunityPriceListReviewProvider,
  ) {}

  /** 21.5f — registrace review provideru v globální PendingActionsService. */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
