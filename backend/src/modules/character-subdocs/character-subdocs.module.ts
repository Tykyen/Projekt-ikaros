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
import {
  CharacterAccountSchemaClass,
  CharacterAccountSchema,
} from './schemas/character-account.schema';
import { CharacterDiaryRepository } from './repositories/character-diary.repository';
import { CharacterCalendarRepository } from './repositories/character-calendar.repository';
import { CharacterFinanceRepository } from './repositories/character-finance.repository';
import { CharacterInventoryRepository } from './repositories/character-inventory.repository';
import { CharacterNotesRepository } from './repositories/character-notes.repository';
import { CharacterAccountRepository } from './repositories/character-account.repository';
import { CharacterSubdocsService } from './character-subdocs.service';
import { CharacterAccountsService } from './character-accounts.service';
import { CharacterAccountsGateway } from './character-accounts.gateway';
import { CharacterSubdocsController } from './character-subdocs.controller';
import { CharacterAccountsController } from './character-accounts.controller';
import { DiaryOverridesController } from './diary-overrides.controller';
import { CharactersModule } from '../characters/characters.module';
import { WorldsModule } from '../worlds/worlds.module';

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
      {
        name: CharacterAccountSchemaClass.name,
        schema: CharacterAccountSchema,
      },
    ]),
    CharactersModule,
    // 8.5 — fallback při čtení deníku postavy: pokud nemá `personalDiarySchema`,
    // service načte aktivní verzi schématu světa z `diary_schema_versions`.
    WorldsModule,
  ],
  controllers: [
    CharacterSubdocsController,
    CharacterAccountsController,
    DiaryOverridesController,
  ],
  providers: [
    CharacterSubdocsService,
    CharacterAccountsService,
    CharacterAccountsGateway,
    CharacterAccountRepository,
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
  exports: [CharacterSubdocsService, CharacterAccountsService],
})
export class CharacterSubdocsModule {}
