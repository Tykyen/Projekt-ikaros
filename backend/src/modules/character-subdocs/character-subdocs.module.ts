import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CharacterDiarySchemaClass,
  CharacterDiarySchema,
} from './schemas/character-diary.schema';
import {
  CharacterCalendarSchemaClass,
  CharacterCalendarSchema,
} from './schemas/character-calendar.schema';
import {
  CharacterFinanceSchemaClass,
  CharacterFinanceSchema,
} from './schemas/character-finance.schema';
import {
  CharacterInventorySchemaClass,
  CharacterInventorySchema,
} from './schemas/character-inventory.schema';
import {
  CharacterNotesSchemaClass,
  CharacterNotesSchema,
} from './schemas/character-notes.schema';
import { CharacterDiaryRepository } from './repositories/character-diary.repository';
import { CharacterCalendarRepository } from './repositories/character-calendar.repository';
import { CharacterFinanceRepository } from './repositories/character-finance.repository';
import { CharacterInventoryRepository } from './repositories/character-inventory.repository';
import { CharacterNotesRepository } from './repositories/character-notes.repository';
import { CharacterSubdocsService } from './character-subdocs.service';
import { CharacterSubdocsController } from './character-subdocs.controller';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterDiarySchemaClass.name, schema: CharacterDiarySchema },
      {
        name: CharacterCalendarSchemaClass.name,
        schema: CharacterCalendarSchema,
      },
      {
        name: CharacterFinanceSchemaClass.name,
        schema: CharacterFinanceSchema,
      },
      {
        name: CharacterInventorySchemaClass.name,
        schema: CharacterInventorySchema,
      },
      { name: CharacterNotesSchemaClass.name, schema: CharacterNotesSchema },
    ]),
    CharactersModule,
  ],
  controllers: [CharacterSubdocsController],
  providers: [
    CharacterSubdocsService,
    {
      provide: 'ICharacterDiaryRepository',
      useClass: CharacterDiaryRepository,
    },
    {
      provide: 'ICharacterCalendarRepository',
      useClass: CharacterCalendarRepository,
    },
    {
      provide: 'ICharacterFinanceRepository',
      useClass: CharacterFinanceRepository,
    },
    {
      provide: 'ICharacterInventoryRepository',
      useClass: CharacterInventoryRepository,
    },
    {
      provide: 'ICharacterNotesRepository',
      useClass: CharacterNotesRepository,
    },
  ],
  exports: [CharacterSubdocsService],
})
export class CharacterSubdocsModule {}
