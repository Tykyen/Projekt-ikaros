/**
 * 10.2d-prep-B — Bestiae modul (standalone vedle 8.4 npc-templates).
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BestieSchema, BestieSchemaClass } from './schemas/bestie.schema';
import { BestiaeRepository } from './repositories/bestiae.repository';
import { BestiaeService } from './bestiae.service';
import { BestiaeController } from './bestiae.controller';
import { MapsModule } from '../maps/maps.module';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BestieSchemaClass.name, schema: BestieSchema },
    ]),
    MapsModule, // pro SystemStatsValidatorService z prep-A
    WorldsModule, // pro IWorldMembershipRepository
  ],
  controllers: [BestiaeController],
  providers: [BestiaeRepository, BestiaeService],
  exports: [BestiaeService, BestiaeRepository],
})
export class BestiaeModule {}
