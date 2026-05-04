import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomEmoteDocument, CustomEmoteSchema } from './schemas/custom-emote.schema';
import { MongoCustomEmotesRepository } from './repositories/custom-emotes.repository';
import { EmotesService } from './emotes.service';
import { EmotesGateway } from './emotes.gateway';
import { EmotesController } from './emotes.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomEmoteDocument.name, schema: CustomEmoteSchema }]),
    WorldsModule,
  ],
  controllers: [EmotesController],
  providers: [
    EmotesService,
    EmotesGateway,
    { provide: 'ICustomEmotesRepository', useClass: MongoCustomEmotesRepository },
  ],
})
export class EmotesModule {}
