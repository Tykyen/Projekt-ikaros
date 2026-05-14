// backend/src/modules/world-weather/world-weather.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WeatherGeneratorSchemaClass,
  WeatherGeneratorSchema,
} from './schemas/weather-generator.schema';
import { MongoWeatherGeneratorRepository } from './repositories/weather-generator.repository';
import { WorldWeatherService } from './world-weather.service';
import { WorldWeatherController } from './world-weather.controller';
import { ChatModule } from '../chat/chat.module';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: WeatherGeneratorSchemaClass.name,
        schema: WeatherGeneratorSchema,
      },
    ]),
    forwardRef(() => WorldsModule), // circular: WorldsService volá WorldWeatherService.seedForWorld
    forwardRef(() => ChatModule), // circular: ChatModule → WorldsModule → WorldWeatherModule → ChatModule
  ],
  controllers: [WorldWeatherController],
  providers: [
    WorldWeatherService,
    {
      provide: 'IWeatherGeneratorRepository',
      useClass: MongoWeatherGeneratorRepository,
    },
  ],
  exports: [WorldWeatherService],
})
export class WorldWeatherModule {}
