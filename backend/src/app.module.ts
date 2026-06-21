import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { createThrottlerOptions } from './common/throttler/throttler.config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WorldsModule } from './modules/worlds/worlds.module';
import { WorldCurrenciesModule } from './modules/world-currencies/world-currencies.module';
import { WorldNewsModule } from './modules/world-news/world-news.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { WorldCalendarConfigModule } from './modules/world-calendar-config/world-calendar-config.module';
import { SystemPresetsModule } from './modules/system-presets/system-presets.module';
import { WorldWeatherModule } from './modules/world-weather/world-weather.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadModule } from './modules/upload/upload.module';
import { GlobalChatModule } from './modules/global-chat/global-chat.module';
import { PresenceModule } from './modules/presence/presence.module';
import { IkarosMessagesModule } from './modules/ikaros-messages/ikaros-messages.module';
import { PagesModule } from './modules/pages/pages.module';
import { WorldPageTemplatesModule } from './modules/world-page-templates/world-page-templates.module';
import { CharactersModule } from './modules/characters/characters.module';
import { CharacterSubdocsModule } from './modules/character-subdocs/character-subdocs.module';
import { CalendarsModule } from './modules/calendars/calendars.module';
import { UniverseModule } from './modules/universe/universe.module';
import { WorldMapsModule } from './modules/world-maps/world-maps.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { WorldGmNotesModule } from './modules/world-gm-notes/world-gm-notes.module';
import { MapsModule } from './modules/maps/maps.module';
import { BestiaeModule } from './modules/bestiae/bestiae.module';
import { DungeonMapsModule } from './modules/dungeon-maps/dungeon-maps.module';
import { IkarosNewsModule } from './modules/ikaros-news/ikaros-news.module';
import { IkarosEventsModule } from './modules/ikaros-events/ikaros-events.module';
import { IkarosArticlesModule } from './modules/ikaros-articles/ikaros-articles.module';
import { IkarosCategoriesModule } from './modules/ikaros-categories/ikaros-categories.module';
import { PendingActionsModule } from './modules/pending-actions/pending-actions.module';
import { IkarosGalleryModule } from './modules/ikaros-gallery/ikaros-gallery.module';
import { IkarosDiscussionsModule } from './modules/ikaros-discussions/ikaros-discussions.module';
import { EmotesModule } from './modules/emotes/emotes.module';
import { ImagesModule } from './modules/images/images.module';
import { SoundsModule } from './modules/sounds/sounds.module';
import { PushModule } from './modules/push/push.module';
import { GameEventsModule } from './modules/game-events/game-events.module';
import { SearchModule } from './modules/search/search.module';
import { StatsModule } from './modules/stats/stats.module';
// Re-enabled po SP4 (2026-05-14): AdminModule + AdminAuditLog + helpers hotov.
import { AdminModule } from './modules/admin/admin.module';
import { FriendshipsModule } from './modules/friendships/friendships.module';
import { DataExportModule } from './modules/data-export/data-export.module';
import { WorldExportModule } from './modules/world-export/world-export.module';
import { SecurityTokensModule } from './modules/security-tokens/security-tokens.module';
import { WorldElevationsModule } from './modules/world-elevations/world-elevations.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Default: 100 requestů/min/IP. Citlivé endpointy mají vlastní @Throttle (login, register, refresh, exists).
    // D-028: storage je opt-in Redis (THROTTLER_REDIS=1) pro multi-instance, jinak in-memory — viz throttler.config.
    ThrottlerModule.forRootAsync({ useFactory: createThrottlerOptions }),
    DatabaseModule,
    // D-028 / D-051 / D-NEW-chat-presence-scale — globální Redis client (cache + pub/sub).
    RedisModule,
    // SP1: foundational @Global() moduly před AuthModule.
    SecurityTokensModule,
    // @Global — guard plní `elevatedWorldIds`; musí být před AuthModule (JwtAuthGuard).
    WorldElevationsModule,
    MailerModule,
    PushModule,
    // @Global pending-actions registry (1.4) — musí být importovaný (i když je @Global),
    // aby Nest věděl o jeho providerech. Friendships (1.8) + Worlds (2.4) +
    // IkarosArticles (3.2a) registrují své providery v onModuleInit().
    PendingActionsModule,
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
    WorldPageTemplatesModule,
    CharactersModule,
    CharacterSubdocsModule,
    CalendarsModule,
    UniverseModule,
    WorldMapsModule,
    CampaignModule,
    WorldGmNotesModule,
    MapsModule,
    BestiaeModule,
    DungeonMapsModule,
    IkarosNewsModule,
    IkarosEventsModule,
    IkarosArticlesModule,
    IkarosCategoriesModule,
    IkarosGalleryModule,
    IkarosDiscussionsModule,
    EmotesModule,
    ImagesModule,
    SoundsModule,
    GameEventsModule,
    SearchModule,
    StatsModule,
    AdminModule,
    FriendshipsModule,
    DataExportModule,
    WorldExportModule,
    WorldNewsModule,
    TimelineModule,
    WorldCalendarConfigModule,
    SystemPresetsModule,
    WorldWeatherModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [
    MatrixWorldSeed,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
