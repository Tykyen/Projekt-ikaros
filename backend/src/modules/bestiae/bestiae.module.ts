/**
 * 10.2d-prep-B — Bestiae modul (standalone vedle 8.4 npc-templates).
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BestieSchema, BestieSchemaClass } from './schemas/bestie.schema';
import {
  BestieCommentSchema,
  BestieCommentSchemaClass,
} from './schemas/bestie-comment.schema';
import { BestiaeRepository } from './repositories/bestiae.repository';
import { BestieCommentsRepository } from './repositories/bestie-comments.repository';
import { BestiaeService } from './bestiae.service';
import { BestieCommentsService } from './bestie-comments.service';
import { BestiaeController } from './bestiae.controller';
import { BestiaeGateway } from './bestiae.gateway';
import { BestiaeModerationEnforcementListener } from './moderation-enforcement.listener';
import { CommunityBestieReviewProvider } from './community-bestie-review.provider';
import { MapsModule } from '../maps/maps.module';
import { WorldsModule } from '../worlds/worlds.module';
import { AuthModule } from '../auth/auth.module';
import { EntitySchemaVersionsModule } from '../entity-schema-versions/entity-schema-versions.module';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BestieSchemaClass.name, schema: BestieSchema },
      { name: BestieCommentSchemaClass.name, schema: BestieCommentSchema },
    ]),
    MapsModule, // pro SystemStatsValidatorService z prep-A
    WorldsModule, // pro IWorldMembershipRepository
    AuthModule, // C-34 — JwtService pro BestiaeGateway user-room join
    EntitySchemaVersionsModule, // 16.2g F2 — world-scoped bestie schema
  ],
  controllers: [BestiaeController],
  providers: [
    BestiaeRepository,
    BestiaeService,
    BestiaeGateway,
    // B5 — enforcement moderačních zásahů nad bestiemi (skrytí/smazání).
    BestiaeModerationEnforcementListener,
    // 16.2b-2 — pending fronta „komunitní bytosti ke schválení".
    CommunityBestieReviewProvider,
    // 16.2b-2 — dvouúrovňová diskuse komunitní bestie.
    BestieCommentsRepository,
    BestieCommentsService,
  ],
  exports: [BestiaeService, BestiaeRepository],
})
export class BestiaeModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: CommunityBestieReviewProvider,
  ) {}

  /** 16.2b-2 — registrace review provideru v globální PendingActionsService. */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
