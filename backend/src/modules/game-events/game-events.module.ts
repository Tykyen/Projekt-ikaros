import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GameEventSchemaClass,
  GameEventSchema,
} from './schemas/game-event.schema';
import { MongoGameEventRepository } from './repositories/game-event.repository';
import { GameEventReminderJob } from './game-event-reminder.job';
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
    { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
  ],
  exports: [GameEventsService, 'IGameEventRepository'], // 14.7c — world-export
})
export class GameEventsModule {}
