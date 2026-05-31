import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorldGmNotesSchemaClass,
  WorldGmNotesSchema,
} from './schemas/world-gm-notes.schema';
import { WorldGmNotesRepository } from './repositories/world-gm-notes.repository';
import { WorldGmNotesService } from './world-gm-notes.service';
import { WorldGmNotesController } from './world-gm-notes.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldGmNotesSchemaClass.name, schema: WorldGmNotesSchema },
    ]),
    // Pro 'IWorldMembershipRepository' (role gate).
    WorldsModule,
  ],
  controllers: [WorldGmNotesController],
  providers: [WorldGmNotesService, WorldGmNotesRepository],
})
export class WorldGmNotesModule {}
