import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  UniverseMapSchemaClass,
  UniverseMapSchema,
} from './schemas/universe-map.schema';
import { MongoUniverseRepository } from './repositories/universe.repository';
import { UniverseService } from './universe.service';
import { UniverseController } from './universe.controller';
import { UniverseGateway } from './universe.gateway';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UniverseMapSchemaClass.name, schema: UniverseMapSchema },
    ]),
    WorldsModule,
  ],
  controllers: [UniverseController],
  providers: [
    UniverseService,
    UniverseGateway,
    { provide: 'IUniverseRepository', useClass: MongoUniverseRepository },
  ],
  exports: [UniverseService],
})
export class UniverseModule {}
