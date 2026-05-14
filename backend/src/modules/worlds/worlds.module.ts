import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldSchemaClass, WorldSchema } from './schemas/world.schema';
import {
  WorldMembershipSchemaClass,
  WorldMembershipSchema,
} from './schemas/world-membership.schema';
import {
  WorldSettingsSchemaClass,
  WorldSettingsSchema,
} from './schemas/world-settings.schema';
import { MongoWorldsRepository } from './repositories/worlds.repository';
import { MongoWorldMembershipRepository } from './repositories/world-membership.repository';
import { MongoWorldSettingsRepository } from './repositories/world-settings.repository';
import { WorldsService } from './worlds.service';
import { WorldsController } from './worlds.controller';
import { WorldsGateway } from './worlds.gateway';
import { WorldJoinRequestProvider } from './world-join-request.provider';
import { PagesModule } from '../pages/pages.module';
import { WorldCurrenciesModule } from '../world-currencies/world-currencies.module';
import {
  DiarySchemaVersionSchemaClass,
  DiarySchemaVersionSchema,
} from './diary-schema-versions/diary-schema-versions.schema';
import { MongoDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions.repository';
import { SystemPresetsModule } from '../system-presets/system-presets.module';
import { WorldWeatherModule } from '../world-weather/world-weather.module';
import { UsersModule } from '../users/users.module';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldSchemaClass.name, schema: WorldSchema },
      { name: WorldMembershipSchemaClass.name, schema: WorldMembershipSchema },
      { name: WorldSettingsSchemaClass.name, schema: WorldSettingsSchema },
      {
        name: DiarySchemaVersionSchemaClass.name,
        schema: DiarySchemaVersionSchema,
      },
    ]),
    forwardRef(() => PagesModule),
    forwardRef(() => WorldCurrenciesModule),
    SystemPresetsModule,
    forwardRef(() => WorldWeatherModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [WorldsController],
  providers: [
    WorldsService,
    { provide: 'IWorldsRepository', useClass: MongoWorldsRepository },
    {
      provide: 'IWorldMembershipRepository',
      useClass: MongoWorldMembershipRepository,
    },
    {
      provide: 'IWorldSettingsRepository',
      useClass: MongoWorldSettingsRepository,
    },
    {
      provide: 'IDiarySchemaVersionsRepository',
      useClass: MongoDiarySchemaVersionsRepository,
    },
    WorldsGateway,
    WorldJoinRequestProvider,
  ],
  exports: [
    WorldsService,
    'IWorldsRepository',
    'IWorldMembershipRepository',
    'IWorldSettingsRepository',
  ],
})
export class WorldsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly worldJoinRequestProvider: WorldJoinRequestProvider,
  ) {}

  /**
   * Spec 2.4 — registrace pending-action providera v globální službě
   * `PendingActionsService` (která je `@Global()`, takže přímý import není
   * potřeba, jen DI).
   */
  onModuleInit() {
    this.pendingActions.register(this.worldJoinRequestProvider);
  }
}
