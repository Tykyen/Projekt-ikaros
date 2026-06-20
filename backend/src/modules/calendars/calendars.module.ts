import { Module } from '@nestjs/common';
import { CharacterSubdocsModule } from '../character-subdocs/character-subdocs.module';
import { CharacterSubdocsService } from '../character-subdocs/character-subdocs.service';
import { CharactersModule } from '../characters/characters.module';
import { CharactersService } from '../characters/characters.service';
import { WorldsModule } from '../worlds/worlds.module';
import { CalendarsService } from './calendars.service';
import { CalendarsController } from './calendars.controller';

@Module({
  imports: [CharacterSubdocsModule, CharactersModule, WorldsModule],
  controllers: [CalendarsController],
  providers: [
    CalendarsService,
    {
      provide: 'CharacterSubdocsService',
      useExisting: CharacterSubdocsService,
    },
    { provide: 'CharactersService', useExisting: CharactersService },
  ],
})
export class CalendarsModule {}
