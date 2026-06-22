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
import { AnonBanService } from './anon-ban.service';
import { AnonBanSchemaClass, AnonBanSchema } from './schemas/anon-ban.schema';

@Module({
  // UploadModule — `UploadService` pro upload příloh (4.3b) i Cloudinary
  // úklid v `CleanMessagesJob`. Importujeme modul (ne provider) → jediná
  // instance, jinak by se `@OnEvent` handlery registrovaly dvakrát.
  imports: [
    ChatModule,
    UsersModule,
    UploadModule,
    // 15.8 — ban hostů (anonymů) v Hospodě.
    MongooseModule.forFeature([
      { name: AnonBanSchemaClass.name, schema: AnonBanSchema },
    ]),
  ],
  controllers: [GlobalChatController],
  providers: [
    GlobalChatService,
    GlobalChatGateway,
    CleanMessagesJob,
    CleanupInactiveUsersJob,
    AnonBanService,
  ],
})
export class GlobalChatModule {}
