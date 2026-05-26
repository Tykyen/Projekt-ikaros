import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorldCalendarConfigSchemaClass,
  WorldCalendarConfigSchema,
} from './schemas/world-calendar-config.schema';
import { WorldCalendarConfigController } from './world-calendar-config.controller';
import { WorldCalendarConfigService } from './world-calendar-config.service';
import { MongoWorldCalendarConfigRepository } from './repositories/world-calendar-config.repository';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: WorldCalendarConfigSchemaClass.name,
        schema: WorldCalendarConfigSchema,
      },
    ]),
    // forwardRef: WorldsModule ↔ WorldCalendarConfigModule cycle
    // (worlds.service auto-seeds Gregorian default při create world).
    forwardRef(() => WorldsModule),
  ],
  controllers: [WorldCalendarConfigController],
  providers: [
    WorldCalendarConfigService,
    {
      provide: 'IWorldCalendarConfigRepository',
      useClass: MongoWorldCalendarConfigRepository,
    },
  ],
  exports: [WorldCalendarConfigService, 'IWorldCalendarConfigRepository'],
})
export class WorldCalendarConfigModule {}
