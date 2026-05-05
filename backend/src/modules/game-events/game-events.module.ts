import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameEventSchemaClass, GameEventSchema } from './schemas/game-event.schema';
import { MongoGameEventRepository } from './repositories/game-event.repository';
import { GameEventReminderJob } from './game-event-reminder.job';
import { GameEventCleanupJob } from './game-event-cleanup.job';
import { WorldsModule } from '../worlds/worlds.module';
import { GameEventsController } from './game-events.controller';
import { GameEventsService } from './game-events.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GameEventSchemaClass.name, schema: GameEventSchema },
    ]),
    WorldsModule,
  ],
  controllers: [GameEventsController],
  providers: [
    GameEventReminderJob,
    GameEventCleanupJob,
    { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
    GameEventsService,
  ],
})
export class GameEventsModule {}
