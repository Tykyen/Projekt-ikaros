import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WorldsModule } from './modules/worlds/worlds.module';
import { WorldCurrenciesModule } from './modules/world-currencies/world-currencies.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadModule } from './modules/upload/upload.module';
import { GlobalChatModule } from './modules/global-chat/global-chat.module';
import { PresenceModule } from './modules/presence/presence.module';
import { IkarosMessagesModule } from './modules/ikaros-messages/ikaros-messages.module';
import { PagesModule } from './modules/pages/pages.module';
import { CharactersModule } from './modules/characters/characters.module';
import { CharacterSubdocsModule } from './modules/character-subdocs/character-subdocs.module';
import { NpcTemplatesModule } from './modules/npc-templates/npc-templates.module';
import { UniverseModule } from './modules/universe/universe.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { MapsModule } from './modules/maps/maps.module';
import { DungeonMapsModule } from './modules/dungeon-maps/dungeon-maps.module';
import { IkarosNewsModule } from './modules/ikaros-news/ikaros-news.module';
import { IkarosArticlesModule } from './modules/ikaros-articles/ikaros-articles.module';
import { IkarosGalleryModule } from './modules/ikaros-gallery/ikaros-gallery.module';
import { IkarosDiscussionsModule } from './modules/ikaros-discussions/ikaros-discussions.module';
import { EmotesModule } from './modules/emotes/emotes.module';
import { ImagesModule } from './modules/images/images.module';
import { SoundsModule } from './modules/sounds/sounds.module';
import { PushModule } from './modules/push/push.module';
import { GameEventsModule } from './modules/game-events/game-events.module';
import { SearchModule } from './modules/search/search.module';
import { StatsModule } from './modules/stats/stats.module';
import { AdminModule } from './modules/admin/admin.module';
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    PushModule,
    AuthModule,
    UsersModule,
    WorldsModule,
    WorldCurrenciesModule,
    ChatModule,
    UploadModule,
    GlobalChatModule,
    PresenceModule,
    IkarosMessagesModule,
    PagesModule,
    CharactersModule,
    CharacterSubdocsModule,
    NpcTemplatesModule,
    UniverseModule,
    CampaignModule,
    MapsModule,
    DungeonMapsModule,
    IkarosNewsModule,
    IkarosArticlesModule,
    IkarosGalleryModule,
    IkarosDiscussionsModule,
    EmotesModule,
    ImagesModule,
    SoundsModule,
    GameEventsModule,
    SearchModule,
    StatsModule,
    AdminModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [MatrixWorldSeed],
})
export class AppModule {}
