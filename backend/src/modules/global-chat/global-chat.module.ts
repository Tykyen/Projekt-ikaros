import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { UsersModule } from '../users/users.module';
import { UploadModule } from '../upload/upload.module';
import { GlobalChatService } from './global-chat.service';
import { GlobalChatController } from './global-chat.controller';
import { GlobalChatGateway } from './global-chat.gateway';
import { CleanMessagesJob } from './clean-messages.job';
import { CleanupInactiveUsersJob } from './cleanup-inactive-users.job';

@Module({
  // UploadModule — `UploadService` pro upload příloh (4.3b) i Cloudinary
  // úklid v `CleanMessagesJob`. Importujeme modul (ne provider) → jediná
  // instance, jinak by se `@OnEvent` handlery registrovaly dvakrát.
  imports: [ChatModule, UsersModule, UploadModule],
  controllers: [GlobalChatController],
  providers: [
    GlobalChatService,
    GlobalChatGateway,
    CleanMessagesJob,
    CleanupInactiveUsersJob,
  ],
})
export class GlobalChatModule {}
