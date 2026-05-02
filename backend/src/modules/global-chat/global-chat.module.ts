import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { GlobalChatService } from './global-chat.service';
import { GlobalChatController } from './global-chat.controller';
import { GlobalChatGateway } from './global-chat.gateway';

@Module({
  imports: [ChatModule],
  controllers: [GlobalChatController],
  providers: [GlobalChatService, GlobalChatGateway],
})
export class GlobalChatModule {}
