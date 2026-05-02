import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterSchemaClass, CharacterSchema } from './schemas/character.schema';
import { MongoCharactersRepository } from './repositories/characters.repository';
import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';
import { WorldsModule } from '../worlds/worlds.module';
import { PopulateProfileImagesService } from './populate-profile-images.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterSchemaClass.name, schema: CharacterSchema }]),
    WorldsModule,
  ],
  controllers: [CharactersController],
  providers: [
    CharactersService,
    { provide: 'ICharactersRepository', useClass: MongoCharactersRepository },
    PopulateProfileImagesService,
  ],
  exports: [CharactersService, 'ICharactersRepository'],
})
export class CharactersModule {}
