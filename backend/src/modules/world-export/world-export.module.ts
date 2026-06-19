import { Module } from '@nestjs/common';
import { WorldExportController } from './world-export.controller';
import { WorldExportService } from './world-export.service';
import { WorldsModule } from '../worlds/worlds.module';
import { PagesModule } from '../pages/pages.module';
import { CharactersModule } from '../characters/characters.module';
import { WorldCalendarConfigModule } from '../world-calendar-config/world-calendar-config.module';
import { MapsModule } from '../maps/maps.module';
import { WorldMapsModule } from '../world-maps/world-maps.module';
import { UniverseModule } from '../universe/universe.module';
import { TimelineModule } from '../timeline/timeline.module';
import { GameEventsModule } from '../game-events/game-events.module';
import { CampaignModule } from '../campaign/campaign.module';
import { BestiaeModule } from '../bestiae/bestiae.module';
import { CharacterSubdocsModule } from '../character-subdocs/character-subdocs.module';

/**
 * 14.7c — Export celého světa do ZIP (pilíř B spec-14.7).
 *
 * Agreguje strom světa z repozitářů importovaných modulů (každý exportuje své
 * DI tokeny). `pj-full` čte vše (PJ vidí vše). Import se zatím nestaví.
 *
 * Endpoint: GET /api/worlds/:worldId/export — JWT required, PJ/Admin.
 */
@Module({
  imports: [
    WorldsModule,
    PagesModule,
    CharactersModule,
    WorldCalendarConfigModule,
    MapsModule,
    WorldMapsModule,
    UniverseModule,
    TimelineModule,
    GameEventsModule,
    CampaignModule,
    BestiaeModule,
    CharacterSubdocsModule,
  ],
  controllers: [WorldExportController],
  providers: [WorldExportService],
})
export class WorldExportModule {}
