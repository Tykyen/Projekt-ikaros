import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DungeonMapSchemaClass,
  DungeonMapSchema,
} from './schemas/dungeon-map.schema';
import { MongoDungeonMapsRepository } from './repositories/dungeon-maps.repository';
import { DungeonMapsService } from './dungeon-maps.service';
import { DungeonMapsController } from './dungeon-maps.controller';
import { WorldsModule } from '../worlds/worlds.module';
import { MapsModule } from '../maps/maps.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DungeonMapSchemaClass.name, schema: DungeonMapSchema },
    ]),
    WorldsModule,
    MapsModule,
    // 21.3a — UsersService kvůli supporter gatingu (isSupporter není v JWT).
    UsersModule,
  ],
  controllers: [DungeonMapsController],
  providers: [
    DungeonMapsService,
    { provide: 'IDungeonMapsRepository', useClass: MongoDungeonMapsRepository },
  ],
})
export class DungeonMapsModule {}
