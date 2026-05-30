import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MapSceneSchemaClass,
  MapSceneSchema,
} from './schemas/map-scene.schema';
import {
  MapTemplateSchemaClass,
  MapTemplateSchema,
} from './schemas/map-template.schema';
import {
  MapOperationSchemaClass,
  MapOperationSchema,
} from './schemas/map-operation.schema';
import { MongoMapsRepository } from './repositories/maps.repository';
import { MongoMapTemplatesRepository } from './repositories/map-templates.repository';
import { MongoMapOperationsRepository } from './repositories/map-operations.repository';
import { OperationPayloadValidator } from './operations/operation-payload-validator.service';
import { OperationsAuthorizer } from './operations/operations-authorizer.service';
import { MapOperationsService } from './operations/map-operations.service';
import { WorldOperationsService } from './operations/world-operations.service';
import { MapsService } from './maps.service';
import { MapsController } from './maps.controller';
import { MapTemplatesController } from './map-templates.controller';
import { WorldOperationsController } from './world-operations.controller';
import { MapsGateway } from './maps.gateway';
import { SchemaRegistryService } from './schemas/system-entity-schema/schema-registry.service';
import { SystemStatsValidatorService } from './schemas/system-entity-schema/system-stats-validator.service';
import { WorldsModule } from '../worlds/worlds.module';
import { CharactersModule } from '../characters/characters.module';
import { CharacterSubdocsModule } from '../character-subdocs/character-subdocs.module';
import { PagesModule } from '../pages/pages.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MapSceneSchemaClass.name, schema: MapSceneSchema },
      { name: MapTemplateSchemaClass.name, schema: MapTemplateSchema },
      // 10.2-prep-1 — per-scene event log
      { name: MapOperationSchemaClass.name, schema: MapOperationSchema },
    ]),
    WorldsModule,
    CharactersModule,
    // 9.1 (cleanup) — enrichTokens potřebuje Page.imageUrl pro token avatary
    // (Character.imageUrl byl smazán). Page lookup přes characterRef.
    PagesModule,
    // 10.2g — enrichTokens potřebuje diary subdoc (HP postavy pro HP bar PC/NPC).
    CharacterSubdocsModule,
    // 10.2-prep-1 hotfix — MapsGateway potřebuje JwtService pro WS auth middleware.
    // AuthModule exportuje JwtModule (stejný pattern jako WorldsModule, IkarosMessagesModule).
    AuthModule,
  ],
  controllers: [
    MapsController,
    MapTemplatesController,
    // 10.2-prep-1 — cross-scene operations endpoint (/worlds/:worldId/operations)
    WorldOperationsController,
  ],
  providers: [
    MapsService,
    MapsGateway,
    { provide: 'IMapsRepository', useClass: MongoMapsRepository },
    {
      provide: 'IMapTemplatesRepository',
      useClass: MongoMapTemplatesRepository,
    },
    // 10.2-prep-1 — operations log repository
    {
      provide: 'IMapOperationsRepository',
      useClass: MongoMapOperationsRepository,
    },
    // 10.2-prep-1 — operation payload validator (sdílený pro map + world ops)
    OperationPayloadValidator,
    // 10.2-prep-1 — autorizační vrstva (assertCanDo per-scene + cross-scene)
    OperationsAuthorizer,
    // 10.2-prep-1 — orchestrátor per-scene ops (validate, authorize, apply, log)
    MapOperationsService,
    // 10.2-prep-1 — orchestrátor cross-scene ops (member.*) + cascade na map ops
    WorldOperationsService,
    // 10.2d-prep-A C10/C11 — schema engine (loaduje JSON z assets/schemas/,
    // validuje token.add/update systemStats proti per-system schématu).
    SchemaRegistryService,
    SystemStatsValidatorService,
  ],
  exports: [
    'IMapsRepository',
    'IMapTemplatesRepository',
    'IMapOperationsRepository',
    OperationPayloadValidator,
    OperationsAuthorizer,
    MapOperationsService,
    WorldOperationsService,
    // 10.2d-prep-A — export pro 10.2d-prep-B (bestiae module) a další konzumenty.
    SchemaRegistryService,
    SystemStatsValidatorService,
  ],
})
export class MapsModule {}
