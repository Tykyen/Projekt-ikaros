import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorldNewsSchemaClass,
  WorldNewsSchema,
} from './schemas/world-news.schema';
import { MongoWorldNewsRepository } from './repositories/world-news.repository';
import { WorldNewsService } from './world-news.service';
import { WorldNewsController } from './world-news.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldNewsSchemaClass.name, schema: WorldNewsSchema },
    ]),
    WorldsModule,
  ],
  controllers: [WorldNewsController],
  providers: [
    WorldNewsService,
    { provide: 'IWorldNewsRepository', useClass: MongoWorldNewsRepository },
  ],
})
export class WorldNewsModule {}
