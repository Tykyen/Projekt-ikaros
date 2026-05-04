import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldCurrenciesSchemaClass, WorldCurrenciesSchema } from './schemas/world-currencies.schema';
import { MongoWorldCurrenciesRepository } from './repositories/world-currencies.repository';
import { WorldCurrenciesService } from './world-currencies.service';
import { WorldCurrenciesController } from './world-currencies.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldCurrenciesSchemaClass.name, schema: WorldCurrenciesSchema },
    ]),
    forwardRef(() => WorldsModule),
  ],
  controllers: [WorldCurrenciesController],
  providers: [
    WorldCurrenciesService,
    { provide: 'IWorldCurrenciesRepository', useClass: MongoWorldCurrenciesRepository },
  ],
  exports: [WorldCurrenciesService],
})
export class WorldCurrenciesModule {}
