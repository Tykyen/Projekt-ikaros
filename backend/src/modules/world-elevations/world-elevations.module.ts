import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorldElevationSchemaClass,
  WorldElevationSchema,
} from './schemas/world-elevation.schema';
import { WorldElevationsService } from './world-elevations.service';
import { MongoWorldElevationsRepository } from './repositories/world-elevations.repository';

/**
 * @Global — guard (JwtAuthGuard/OptionalJwtAuthGuard) plní `elevatedWorldIds`
 * napříč všemi moduly, proto musí být služba dostupná globálně.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldElevationSchemaClass.name, schema: WorldElevationSchema },
    ]),
  ],
  providers: [
    WorldElevationsService,
    {
      provide: 'IWorldElevationsRepository',
      useClass: MongoWorldElevationsRepository,
    },
  ],
  exports: [WorldElevationsService],
})
export class WorldElevationsModule {}
