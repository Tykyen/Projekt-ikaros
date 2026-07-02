import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EntitySchemaVersionSchemaClass,
  EntitySchemaVersionSchema,
} from './entity-schema-version.schema';
import { MongoEntitySchemaVersionsRepository } from './entity-schema-versions.repository';
import { EntitySchemaVersionsService } from './entity-schema-versions.service';
import { EntitySchemaVersionsController } from './entity-schema-versions.controller';
import { WorldsModule } from '../worlds/worlds.module';

/**
 * 16.2g F2 — modul per-svět schémat entit (bestie/token) pro „Vlastní Systém".
 * Importuje `WorldsModule` (WorldsService PJ+ guard + membership repo).
 * Exportuje service pro `BestiaeModule` (validace bestií proti world schématu).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: EntitySchemaVersionSchemaClass.name,
        schema: EntitySchemaVersionSchema,
      },
    ]),
    WorldsModule,
  ],
  controllers: [EntitySchemaVersionsController],
  providers: [
    {
      provide: 'IEntitySchemaVersionsRepository',
      useClass: MongoEntitySchemaVersionsRepository,
    },
    EntitySchemaVersionsService,
  ],
  exports: [EntitySchemaVersionsService],
})
export class EntitySchemaVersionsModule {}
