/**
 * 21.5b — Potions modul (lektvary, komunitní katalog). Mirror spells.module
 * (21.5c). JwtAuthGuard se resolvne z globálních modulů, AuthModule netřeba.
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PotionSchema, PotionSchemaClass } from './schemas/potion.schema';
import {
  PotionCommentSchema,
  PotionCommentSchemaClass,
} from './schemas/potion-comment.schema';
import { PotionsRepository } from './repositories/potions.repository';
import { PotionCommentsRepository } from './repositories/potion-comments.repository';
import { PotionsService } from './potions.service';
import { PotionCommentsService } from './potion-comments.service';
import { PotionsController } from './potions.controller';
import { CommunityPotionReviewProvider } from './community-potion-review.provider';
import { PotionsModerationEnforcementListener } from './moderation-enforcement.listener';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PotionSchemaClass.name, schema: PotionSchema },
      { name: PotionCommentSchemaClass.name, schema: PotionCommentSchema },
    ]),
  ],
  controllers: [PotionsController],
  providers: [
    PotionsRepository,
    PotionCommentsRepository,
    PotionsService,
    PotionCommentsService,
    // 21.5b — pending fronta „lektvary ke schválení".
    CommunityPotionReviewProvider,
    // Enforcement moderace 20B (skrýt/smazat lektvar).
    PotionsModerationEnforcementListener,
  ],
  exports: [PotionsService],
})
export class PotionsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: CommunityPotionReviewProvider,
  ) {}

  /** 21.5b — registrace review provideru v globální PendingActionsService. */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
