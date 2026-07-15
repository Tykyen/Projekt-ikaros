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
import {
  WorldAccessRequestSchemaClass,
  WorldAccessRequestSchema,
} from './schemas/world-access-request.schema';
import {
  WorldInviteSchemaClass,
  WorldInviteSchema,
} from './schemas/world-invite.schema';
import {
  WorldOperationSchemaClass,
  WorldOperationSchema,
} from './schemas/world-operation.schema';
import { MongoWorldsRepository } from './repositories/worlds.repository';
import { WorldHardDeleteService } from './services/world-hard-delete.service';
import { WorldCleanupCron } from './services/world-cleanup.cron';
import { MongoWorldMembershipRepository } from './repositories/world-membership.repository';
import { MongoWorldSettingsRepository } from './repositories/world-settings.repository';
import { MongoWorldAccessRequestRepository } from './repositories/world-access-request.repository';
import { MongoWorldInviteRepository } from './repositories/world-invite.repository';
import { MongoWorldOperationsRepository } from './repositories/world-operations.repository';
import { WorldsService } from './worlds.service';
import { WorldsController } from './worlds.controller';
import { WorldsGateway } from './worlds.gateway';
import { WorldAccessRequestProvider } from './world-access-request.provider';
import { WorldInviteProvider } from './world-invite.provider';
import { PagesModule } from '../pages/pages.module';
import { CharactersModule } from '../characters/characters.module';
import { WorldCurrenciesModule } from '../world-currencies/world-currencies.module';
import {
  DiarySchemaVersionSchemaClass,
  DiarySchemaVersionSchema,
} from './diary-schema-versions/diary-schema-versions.schema';
import { MongoDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions.repository';
import { SystemPresetsModule } from '../system-presets/system-presets.module';
import { WorldWeatherModule } from '../world-weather/world-weather.module';
import { WorldCalendarConfigModule } from '../world-calendar-config/world-calendar-config.module';
import { UsersModule } from '../users/users.module';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
import { PendingActionsModule } from '../pending-actions/pending-actions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldSchemaClass.name, schema: WorldSchema },
      { name: WorldMembershipSchemaClass.name, schema: WorldMembershipSchema },
      { name: WorldSettingsSchemaClass.name, schema: WorldSettingsSchema },
      {
        name: WorldAccessRequestSchemaClass.name,
        schema: WorldAccessRequestSchema,
      },
      { name: WorldInviteSchemaClass.name, schema: WorldInviteSchema },
      {
        name: DiarySchemaVersionSchemaClass.name,
        schema: DiarySchemaVersionSchema,
      },
      // 10.2-prep-1 — cross-scene event log
      { name: WorldOperationSchemaClass.name, schema: WorldOperationSchema },
    ]),
    forwardRef(() => PagesModule),
    // FIX-18 — updateMemberCharacter ověřuje vlastnictví Character při self-edit
    // (ne cizí identita). Kruh CharactersModule → forwardRef(WorldsModule)
    // existuje už dřív; tady doplňujeme opačný směr (stejný vzor jako UsersModule).
    forwardRef(() => CharactersModule),
    forwardRef(() => WorldCurrenciesModule),
    SystemPresetsModule,
    forwardRef(() => WorldWeatherModule),
    forwardRef(() => WorldCalendarConfigModule),
    forwardRef(() => UsersModule),
    // forwardRef — WorldsModule ↔ AuthModule ↔ UsersModule tvoří kruh.
    forwardRef(() => AuthModule),
    // WorldAccessRequestProvider konzumuje PendingActionsService.
    PendingActionsModule,
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
      provide: 'IWorldAccessRequestRepository',
      useClass: MongoWorldAccessRequestRepository,
    },
    {
      provide: 'IWorldInviteRepository',
      useClass: MongoWorldInviteRepository,
    },
    {
      provide: 'IDiarySchemaVersionsRepository',
      useClass: MongoDiarySchemaVersionsRepository,
    },
    // 10.2-prep-1 — world operations log repository
    {
      provide: 'IWorldOperationsRepository',
      useClass: MongoWorldOperationsRepository,
    },
    WorldsGateway,
    WorldAccessRequestProvider,
    WorldInviteProvider,
    WorldHardDeleteService,
    WorldCleanupCron,
  ],
  exports: [
    WorldsService,
    'IWorldsRepository',
    'IWorldMembershipRepository',
    'IWorldSettingsRepository',
    'IWorldAccessRequestRepository',
    // 8.5 — sdíleno s character-subdocs (fallback při čtení diaryDat
    // postavy bez `personalDiarySchema`).
    'IDiarySchemaVersionsRepository',
    // 10.2-prep-1 — operations log (potřebuje MapsModule pro cascade)
    'IWorldOperationsRepository',
  ],
})
export class WorldsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly worldAccessRequestProvider: WorldAccessRequestProvider,
    private readonly worldInviteProvider: WorldInviteProvider,
  ) {}

  /**
   * Spec 2.4 — registrace pending-action providerů v globální službě
   * `PendingActionsService` (která je `@Global()`, takže přímý import není
   * potřeba, jen DI). 15.10 — přidán `WorldInviteProvider` (pozvánky pozvanému).
   */
  onModuleInit() {
    this.pendingActions.register(this.worldAccessRequestProvider);
    this.pendingActions.register(this.worldInviteProvider);
  }
}
