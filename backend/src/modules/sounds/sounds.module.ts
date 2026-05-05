import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SoundSchemaClass, SoundSchema } from './schemas/sound.schema';
import { MongoSoundsRepository } from './repositories/sounds.repository';
import { SoundsService } from './sounds.service';
import { SoundsController } from './sounds.controller';
import { WorldSoundsController } from './world-sounds.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SoundSchemaClass.name, schema: SoundSchema }]),
    WorldsModule,
  ],
  controllers: [SoundsController, WorldSoundsController],
  providers: [
    SoundsService,
    { provide: 'ISoundsRepository', useClass: MongoSoundsRepository },
  ],
  exports: [SoundsService],
})
export class SoundsModule {}
