import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WorldsModule } from './modules/worlds/worlds.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadModule } from './modules/upload/upload.module';
import { GlobalChatModule } from './modules/global-chat/global-chat.module';
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    AuthModule,
    WorldsModule,
    ChatModule,
    UploadModule,
    GlobalChatModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [MatrixWorldSeed],
})
export class AppModule {}
