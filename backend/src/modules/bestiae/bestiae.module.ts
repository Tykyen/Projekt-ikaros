/**
 * 10.2d-prep-B — Bestiae modul (standalone vedle 8.4 npc-templates).
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BestieSchema, BestieSchemaClass } from './schemas/bestie.schema';
import { BestiaeRepository } from './repositories/bestiae.repository';
import { BestiaeService } from './bestiae.service';
import { BestiaeController } from './bestiae.controller';
import { BestiaeGateway } from './bestiae.gateway';
import { BestiaeModerationEnforcementListener } from './moderation-enforcement.listener';
import { MapsModule } from '../maps/maps.module';
import { WorldsModule } from '../worlds/worlds.module';
import { AuthModule } from '../auth/auth.module';
import { EntitySchemaVersionsModule } from '../entity-schema-versions/entity-schema-versions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BestieSchemaClass.name, schema: BestieSchema },
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
  ],
  exports: [BestiaeService, BestiaeRepository],
})
export class BestiaeModule {}
