import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TimelineEventSchemaClass,
  TimelineEventSchema,
} from './schemas/timeline-event.schema';
import { MongoTimelineRepository } from './repositories/timeline.repository';
import { TimelineService } from './timeline.service';
import { TimelineController } from './timeline.controller';
import { WorldsModule } from '../worlds/worlds.module';
import { WorldCalendarConfigModule } from '../world-calendar-config/world-calendar-config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TimelineEventSchemaClass.name, schema: TimelineEventSchema },
    ]),
    WorldsModule,
    WorldCalendarConfigModule,
  ],
  controllers: [TimelineController],
  providers: [
    TimelineService,
    { provide: 'ITimelineRepository', useClass: MongoTimelineRepository },
  ],
  exports: ['ITimelineRepository'], // 14.7c — world-export
})
export class TimelineModule {}
