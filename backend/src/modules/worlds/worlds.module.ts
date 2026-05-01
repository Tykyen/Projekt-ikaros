import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldSchemaClass, WorldSchema } from './schemas/world.schema';
import { WorldMembershipSchemaClass, WorldMembershipSchema } from './schemas/world-membership.schema';
import { WorldSettingsSchemaClass, WorldSettingsSchema } from './schemas/world-settings.schema';
import { MongoWorldsRepository } from './repositories/worlds.repository';
import { MongoWorldMembershipRepository } from './repositories/world-membership.repository';
import { MongoWorldSettingsRepository } from './repositories/world-settings.repository';
import { WorldsService } from './worlds.service';
import { WorldsController } from './worlds.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldSchemaClass.name, schema: WorldSchema },
      { name: WorldMembershipSchemaClass.name, schema: WorldMembershipSchema },
      { name: WorldSettingsSchemaClass.name, schema: WorldSettingsSchema },
    ]),
  ],
  controllers: [WorldsController],
  providers: [
    WorldsService,
    { provide: 'IWorldsRepository', useClass: MongoWorldsRepository },
    { provide: 'IWorldMembershipRepository', useClass: MongoWorldMembershipRepository },
    { provide: 'IWorldSettingsRepository', useClass: MongoWorldSettingsRepository },
  ],
  exports: [WorldsService, 'IWorldsRepository', 'IWorldMembershipRepository'],
})
export class WorldsModule {}
