import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorldPageTemplateSchemaClass,
  WorldPageTemplateSchema,
} from './schemas/world-page-template.schema';
import { MongoWorldPageTemplatesRepository } from './repositories/world-page-templates.repository';
import { WorldPageTemplatesService } from './world-page-templates.service';
import { WorldPageTemplatesController } from './world-page-templates.controller';
import { WorldPageTemplatesMatrixSeed } from './world-page-templates.matrix-seed';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: WorldPageTemplateSchemaClass.name,
        schema: WorldPageTemplateSchema,
      },
    ]),
    WorldsModule,
  ],
  controllers: [WorldPageTemplatesController],
  providers: [
    WorldPageTemplatesService,
    {
      provide: 'IWorldPageTemplatesRepository',
      useClass: MongoWorldPageTemplatesRepository,
    },
    WorldPageTemplatesMatrixSeed,
  ],
  exports: [WorldPageTemplatesService, 'IWorldPageTemplatesRepository'],
})
export class WorldPageTemplatesModule {}
