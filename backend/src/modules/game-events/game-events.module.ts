import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GameEventSchemaClass,
  GameEventSchema,
} from './schemas/game-event.schema';
import { MongoGameEventRepository } from './repositories/game-event.repository';
import { GameEventReminderJob } from './game-event-reminder.job';
import { GameEventCleanupJob } from './game-event-cleanup.job';
import { GameEventsService } from './game-events.service';
import { GameEventsController } from './game-events.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GameEventSchemaClass.name, schema: GameEventSchema },
    ]),
    WorldsModule,
  ],
  controllers: [GameEventsController],
  providers: [
    GameEventsService,
    GameEventReminderJob,
    GameEventCleanupJob,
    { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
  ],
  exports: [GameEventsService],
})
export class GameEventsModule {}
