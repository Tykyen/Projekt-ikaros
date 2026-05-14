import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MapSceneSchemaClass,
  MapSceneSchema,
} from './schemas/map-scene.schema';
import {
  MapTemplateSchemaClass,
  MapTemplateSchema,
} from './schemas/map-template.schema';
import { MongoMapsRepository } from './repositories/maps.repository';
import { MongoMapTemplatesRepository } from './repositories/map-templates.repository';
import { MapsService } from './maps.service';
import { MapsController } from './maps.controller';
import { MapTemplatesController } from './map-templates.controller';
import { MapsGateway } from './maps.gateway';
import { WorldsModule } from '../worlds/worlds.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MapSceneSchemaClass.name, schema: MapSceneSchema },
      { name: MapTemplateSchemaClass.name, schema: MapTemplateSchema },
    ]),
    WorldsModule,
    CharactersModule,
  ],
  controllers: [MapsController, MapTemplatesController],
  providers: [
    MapsService,
    MapsGateway,
    { provide: 'IMapsRepository', useClass: MongoMapsRepository },
    {
      provide: 'IMapTemplatesRepository',
      useClass: MongoMapTemplatesRepository,
    },
  ],
  exports: ['IMapsRepository', 'IMapTemplatesRepository'],
})
export class MapsModule {}
