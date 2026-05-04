import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WorldsModule } from './modules/worlds/worlds.module';
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
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    WorldsModule,
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
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [MatrixWorldSeed],
})
export class AppModule {}
