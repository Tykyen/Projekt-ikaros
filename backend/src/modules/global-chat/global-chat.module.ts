import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { GlobalChatService } from './global-chat.service';
import { GlobalChatController } from './global-chat.controller';
import { GlobalChatGateway } from './global-chat.gateway';
import { CleanMessagesJob } from './clean-messages.job';
import { CleanupInactiveUsersJob } from './cleanup-inactive-users.job';

@Module({
  imports: [ChatModule],
  controllers: [GlobalChatController],
  providers: [
    GlobalChatService,
    GlobalChatGateway,
    CleanMessagesJob,
    CleanupInactiveUsersJob,
  ],
})
export class GlobalChatModule {}
