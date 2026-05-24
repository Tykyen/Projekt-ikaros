import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CharacterSchemaClass,
  CharacterSchema,
} from './schemas/character.schema';
import { MongoCharactersRepository } from './repositories/characters.repository';
import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterSchemaClass.name, schema: CharacterSchema },
    ]),
    // Kruh: CharactersModule → WorldsModule → UsersModule → CharactersModule
    // (viz users.module.ts:35). forwardRef nutný, jinak je WorldsModule
    // v okamžiku scan-time undefined.
    forwardRef(() => WorldsModule),
  ],
  controllers: [CharactersController],
  providers: [
    CharactersService,
    { provide: 'ICharactersRepository', useClass: MongoCharactersRepository },
    // 9.1 (cleanup) — PopulateProfileImagesService odstraněna; po sjednocení
    // Character→Page se avatary řeší v Page editoru a User.profileImageUrl
    // se nastavuje samostatně přes Profile UI.
  ],
  exports: [CharactersService, 'ICharactersRepository'],
})
export class CharactersModule {}
