/**
 * 21.5c — Spells modul (kouzla, komunitní katalog). Vzor: plants.module
 * (community-only) + komentáře/statblok endpointy z bestiae. JwtAuthGuard se
 * resolvne z globálních modulů (UsersModule/WorldElevationsModule), proto
 * AuthModule netřeba importovat.
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SpellSchema, SpellSchemaClass } from './schemas/spell.schema';
import {
  SpellCommentSchema,
  SpellCommentSchemaClass,
} from './schemas/spell-comment.schema';
import { SpellsRepository } from './repositories/spells.repository';
import { SpellCommentsRepository } from './repositories/spell-comments.repository';
import { SpellsService } from './spells.service';
import { SpellCommentsService } from './spell-comments.service';
import { SpellsController } from './spells.controller';
import { CommunitySpellReviewProvider } from './community-spell-review.provider';
import { SpellsModerationEnforcementListener } from './moderation-enforcement.listener';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SpellSchemaClass.name, schema: SpellSchema },
      { name: SpellCommentSchemaClass.name, schema: SpellCommentSchema },
    ]),
  ],
  controllers: [SpellsController],
  providers: [
    SpellsRepository,
    SpellCommentsRepository,
    SpellsService,
    SpellCommentsService,
    // 21.5c — pending fronta „kouzla ke schválení".
    CommunitySpellReviewProvider,
    // Enforcement moderace 20B (skrýt/smazat kouzlo).
    SpellsModerationEnforcementListener,
  ],
  exports: [SpellsService],
})
export class SpellsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: CommunitySpellReviewProvider,
  ) {}

  /** 21.5c — registrace review provideru v globální PendingActionsService. */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
