import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatModule } from '../chat/chat.module';
import { UsersModule } from '../users/users.module';
import { UploadModule } from '../upload/upload.module';
import { GlobalChatService } from './global-chat.service';
import { GlobalChatController } from './global-chat.controller';
import { GlobalChatGateway } from './global-chat.gateway';
import { CleanMessagesJob } from './clean-messages.job';
import { CleanupInactiveUsersJob } from './cleanup-inactive-users.job';
import { CampRotationJob } from './camp-rotation.job';
import { AnonBanService } from './anon-ban.service';
import { AnonBanSchemaClass, AnonBanSchema } from './schemas/anon-ban.schema';
import {
  CampSavedGameSchemaClass,
  CampSavedGameSchema,
} from './schemas/camp-saved-game.schema';
import {
  CampRoomConfigSchemaClass,
  CampRoomConfigSchema,
} from './schemas/camp-room-config.schema';

@Module({
  // UploadModule — `UploadService` pro upload příloh (4.3b) i Cloudinary
  // úklid v `CleanMessagesJob`. Importujeme modul (ne provider) → jediná
  // instance, jinak by se `@OnEvent` handlery registrovaly dvakrát.
  imports: [
    ChatModule,
    UsersModule,
    UploadModule,
    // 15.8 — ban hostů; 16.6 — uložené hry + admin default žánru Campu.
    MongooseModule.forFeature([
      { name: AnonBanSchemaClass.name, schema: AnonBanSchema },
      { name: CampSavedGameSchemaClass.name, schema: CampSavedGameSchema },
      { name: CampRoomConfigSchemaClass.name, schema: CampRoomConfigSchema },
    ]),
  ],
  controllers: [GlobalChatController],
  providers: [
    GlobalChatService,
    GlobalChatGateway,
    CleanMessagesJob,
    CleanupInactiveUsersJob,
    CampRotationJob,
    AnonBanService,
  ],
})
export class GlobalChatModule {}
