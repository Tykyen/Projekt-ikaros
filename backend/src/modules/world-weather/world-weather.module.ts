// backend/src/modules/world-weather/world-weather.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WeatherGeneratorSchemaClass,
  WeatherGeneratorSchema,
} from './schemas/weather-generator.schema';
import {
  CustomWeatherPresetSchemaClass,
  CustomWeatherPresetSchema,
} from './schemas/custom-weather-preset.schema';
import {
  WeatherHistorySchemaClass,
  WeatherHistorySchema,
} from './schemas/weather-history.schema';
import {
  WeatherGeneratorSetSchemaClass,
  WeatherGeneratorSetSchema,
} from './schemas/weather-generator-set.schema';
import { MongoWeatherGeneratorRepository } from './repositories/weather-generator.repository';
import { MongoCustomWeatherPresetRepository } from './repositories/custom-weather-preset.repository';
import { MongoWeatherHistoryRepository } from './repositories/weather-history.repository';
import { MongoWeatherGeneratorSetRepository } from './repositories/weather-generator-set.repository';
import { WorldWeatherService } from './world-weather.service';
import { WeatherGeneratorSetService } from './weather-generator-set.service';
import { WorldWeatherController } from './world-weather.controller';
import { CustomWeatherPresetController } from './custom-weather-preset.controller';
import { WeatherGeneratorSetController } from './weather-generator-set.controller';
import { ChatModule } from '../chat/chat.module';
import { WorldsModule } from '../worlds/worlds.module';
import { WorldCalendarConfigModule } from '../world-calendar-config/world-calendar-config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: WeatherGeneratorSchemaClass.name,
        schema: WeatherGeneratorSchema,
      },
      {
        name: CustomWeatherPresetSchemaClass.name,
        schema: CustomWeatherPresetSchema,
      },
      {
        name: WeatherHistorySchemaClass.name,
        schema: WeatherHistorySchema,
      },
      {
        // 9.4 Weather Generator Sets
        name: WeatherGeneratorSetSchemaClass.name,
        schema: WeatherGeneratorSetSchema,
      },
    ]),
    forwardRef(() => WorldsModule), // circular: WorldsService volá WorldWeatherService.seedForWorld
    forwardRef(() => ChatModule), // circular: ChatModule → WorldsModule → WorldWeatherModule → ChatModule
    WorldCalendarConfigModule, // 9.4-I — calendar integration (monthsTotal, month names)
  ],
  controllers: [
    WorldWeatherController,
    CustomWeatherPresetController,
    WeatherGeneratorSetController,
  ],
  providers: [
    WorldWeatherService,
    WeatherGeneratorSetService,
    {
      provide: 'IWeatherGeneratorRepository',
      useClass: MongoWeatherGeneratorRepository,
    },
    {
      // 9.4-dluh — custom presets per svět
      provide: 'ICustomWeatherPresetRepository',
      useClass: MongoCustomWeatherPresetRepository,
    },
    {
      // 9.4 dluh #2 — historie počasí
      provide: 'IWeatherHistoryRepository',
      useClass: MongoWeatherHistoryRepository,
    },
    {
      // 9.4 Weather Generator Sets
      provide: 'IWeatherGeneratorSetRepository',
      useClass: MongoWeatherGeneratorSetRepository,
    },
  ],
  exports: [WorldWeatherService, WeatherGeneratorSetService],
})
export class WorldWeatherModule {}
