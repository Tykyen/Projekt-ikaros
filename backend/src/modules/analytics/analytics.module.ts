import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AnalyticsEventSchemaClass,
  AnalyticsEventSchema,
} from './schemas/analytics-event.schema';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsEventSchemaClass.name, schema: AnalyticsEventSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  // 19.1 — admin growth dashboard čte `visitors` ze summary (akviziční poměr).
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
