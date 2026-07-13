/**
 * 21.2a — NameSets modul (jmenné sady pro Generátory). Vzor: plants.module.
 * Jen community scope, bez obrázků/komentářů. JwtAuthGuard se resolvne
 * z globálních modulů — AuthModule netřeba importovat.
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NameSetSchema, NameSetSchemaClass } from './schemas/name-set.schema';
import { NameSetsRepository } from './repositories/name-sets.repository';
import { NameSetsService } from './name-sets.service';
import { NameSetsController } from './name-sets.controller';
import { CommunityNameSetReviewProvider } from './community-name-set-review.provider';
import { NameSetsModerationEnforcementListener } from './moderation-enforcement.listener';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NameSetSchemaClass.name, schema: NameSetSchema },
    ]),
  ],
  controllers: [NameSetsController],
  providers: [
    NameSetsRepository,
    NameSetsService,
    // 21.2a — pending fronta „jmenné sady ke schválení".
    CommunityNameSetReviewProvider,
    // Spec 20B — enforcement moderace (skrýt/smazat sadu).
    NameSetsModerationEnforcementListener,
  ],
  exports: [NameSetsService],
})
export class NameSetsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: CommunityNameSetReviewProvider,
  ) {}

  /** 21.2a — registrace review provideru v globální PendingActionsService. */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
