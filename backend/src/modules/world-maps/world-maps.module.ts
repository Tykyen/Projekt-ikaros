import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorldMapEntrySchemaClass,
  WorldMapEntrySchema,
} from './schemas/world-map-entry.schema';
import {
  WorldMapFolderSchemaClass,
  WorldMapFolderSchema,
} from './schemas/world-map-folder.schema';
import { MongoWorldMapsRepository } from './repositories/world-maps.repository';
import { MongoWorldMapFoldersRepository } from './repositories/world-map-folders.repository';
import { WorldMapsService } from './world-maps.service';
import { WorldMapsController } from './world-maps.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldMapEntrySchemaClass.name, schema: WorldMapEntrySchema },
      {
        name: WorldMapFolderSchemaClass.name,
        schema: WorldMapFolderSchema,
      },
    ]),
    WorldsModule,
  ],
  controllers: [WorldMapsController],
  providers: [
    WorldMapsService,
    { provide: 'IWorldMapsRepository', useClass: MongoWorldMapsRepository },
    {
      provide: 'IWorldMapFoldersRepository',
      useClass: MongoWorldMapFoldersRepository,
    },
  ],
  exports: [WorldMapsService],
})
export class WorldMapsModule {}
