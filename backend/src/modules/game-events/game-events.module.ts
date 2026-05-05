import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameEventSchemaClass, GameEventSchema } from './schemas/game-event.schema';
import { MongoGameEventRepository } from './repositories/game-event.repository';
import { GameEventReminderJob } from './game-event-reminder.job';
import { GameEventCleanupJob } from './game-event-cleanup.job';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GameEventSchemaClass.name, schema: GameEventSchema },
    ]),
    WorldsModule,
  ],
  providers: [
    GameEventReminderJob,
    GameEventCleanupJob,
    { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
  ],
})
export class GameEventsModule {}
