import { Module } from '@nestjs/common';
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
    WorldsModule,
  ],
  controllers: [WorldCalendarConfigController],
  providers: [
    WorldCalendarConfigService,
    {
      provide: 'IWorldCalendarConfigRepository',
      useClass: MongoWorldCalendarConfigRepository,
    },
  ],
  exports: [WorldCalendarConfigService],
})
export class WorldCalendarConfigModule {}
