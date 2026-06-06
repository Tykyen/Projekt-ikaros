import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorldMapsSchemaClass,
  WorldMapsSchema,
} from './schemas/world-maps.schema';
import { MongoWorldMapsRepository } from './repositories/world-maps.repository';
import { WorldMapsService } from './world-maps.service';
import { WorldMapsController } from './world-maps.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldMapsSchemaClass.name, schema: WorldMapsSchema },
    ]),
    WorldsModule,
  ],
  controllers: [WorldMapsController],
  providers: [
    WorldMapsService,
    { provide: 'IWorldMapsRepository', useClass: MongoWorldMapsRepository },
  ],
  exports: [WorldMapsService],
})
export class WorldMapsModule {}
