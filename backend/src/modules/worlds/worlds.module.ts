import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldSchemaClass, WorldSchema } from './schemas/world.schema';
import { WorldMembershipSchemaClass, WorldMembershipSchema } from './schemas/world-membership.schema';
import { WorldSettingsSchemaClass, WorldSettingsSchema } from './schemas/world-settings.schema';
import { MongoWorldsRepository } from './repositories/worlds.repository';
import { MongoWorldMembershipRepository } from './repositories/world-membership.repository';
import { MongoWorldSettingsRepository } from './repositories/world-settings.repository';
import { WorldsService } from './worlds.service';
import { WorldsController } from './worlds.controller';
import { WorldsGateway } from './worlds.gateway';
import { PagesModule } from '../pages/pages.module';
import { WorldCurrenciesModule } from '../world-currencies/world-currencies.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldSchemaClass.name, schema: WorldSchema },
      { name: WorldMembershipSchemaClass.name, schema: WorldMembershipSchema },
      { name: WorldSettingsSchemaClass.name, schema: WorldSettingsSchema },
    ]),
    forwardRef(() => PagesModule),
    forwardRef(() => WorldCurrenciesModule),
  ],
  controllers: [WorldsController],
  providers: [
    WorldsService,
    { provide: 'IWorldsRepository', useClass: MongoWorldsRepository },
    { provide: 'IWorldMembershipRepository', useClass: MongoWorldMembershipRepository },
    { provide: 'IWorldSettingsRepository', useClass: MongoWorldSettingsRepository },
    WorldsGateway,
  ],
  exports: [WorldsService, 'IWorldsRepository', 'IWorldMembershipRepository'],
})
export class WorldsModule {}
