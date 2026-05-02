import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatGroupSchemaClass, ChatGroupSchema } from './schemas/chat-group.schema';
import { ChatChannelSchemaClass, ChatChannelSchema } from './schemas/chat-channel.schema';
import { ChatMessageSchemaClass, ChatMessageSchema } from './schemas/chat-message.schema';
import { ChannelReadStatusSchemaClass, ChannelReadStatusSchema } from './schemas/channel-read-status.schema';
import { MongoChatGroupRepository } from './repositories/chat-group.repository';
import { MongoChatChannelRepository } from './repositories/chat-channel.repository';
import { MongoChatMessageRepository } from './repositories/chat-message.repository';
import { MongoChannelReadStatusRepository } from './repositories/channel-read-status.repository';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatGroupSchemaClass.name, schema: ChatGroupSchema },
      { name: ChatChannelSchemaClass.name, schema: ChatChannelSchema },
      { name: ChatMessageSchemaClass.name, schema: ChatMessageSchema },
      { name: ChannelReadStatusSchemaClass.name, schema: ChannelReadStatusSchema },
    ]),
    WorldsModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    { provide: 'IChatGroupRepository', useClass: MongoChatGroupRepository },
    { provide: 'IChatChannelRepository', useClass: MongoChatChannelRepository },
    { provide: 'IChatMessageRepository', useClass: MongoChatMessageRepository },
    { provide: 'IChannelReadStatusRepository', useClass: MongoChannelReadStatusRepository },
    ChatGateway,
  ],
  exports: [ChatService],
})
export class ChatModule {}
