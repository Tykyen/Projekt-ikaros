import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ChatGroupSchemaClass,
  ChatGroupSchema,
} from './schemas/chat-group.schema';
import {
  ChatChannelSchemaClass,
  ChatChannelSchema,
} from './schemas/chat-channel.schema';
import {
  ChatMessageSchemaClass,
  ChatMessageSchema,
} from './schemas/chat-message.schema';
import {
  ChannelReadStatusSchemaClass,
  ChannelReadStatusSchema,
} from './schemas/channel-read-status.schema';
import {
  ScheduledMessageSchemaClass,
  ScheduledMessageSchema,
} from './schemas/scheduled-message.schema';
import { MongoChatGroupRepository } from './repositories/chat-group.repository';
import { MongoChatChannelRepository } from './repositories/chat-channel.repository';
import { MongoChatMessageRepository } from './repositories/chat-message.repository';
import { MongoChannelReadStatusRepository } from './repositories/channel-read-status.repository';
import { MongoScheduledMessageRepository } from './repositories/scheduled-message.repository';
import { ChatService } from './chat.service';
import { ChatModerationEnforcementListener } from './moderation-enforcement.listener';
import { ChatPresenceService } from './chat-presence.service';
import { ChatController } from './chat.controller';
import { ChatFeedController } from './chat-feed.controller';
import { ScheduledMessagesController } from './scheduled-messages.controller';
import { ScheduledMessagesJob } from './scheduled-messages.job';
import { ChatGateway } from './chat.gateway';
import { WorldsModule } from '../worlds/worlds.module';
import { UsersModule } from '../users/users.module';
import { CharactersModule } from '../characters/characters.module';
import { PushModule } from '../push/push.module';
import { UploadModule } from '../upload/upload.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatGroupSchemaClass.name, schema: ChatGroupSchema },
      { name: ChatChannelSchemaClass.name, schema: ChatChannelSchema },
      { name: ChatMessageSchemaClass.name, schema: ChatMessageSchema },
      {
        name: ChannelReadStatusSchemaClass.name,
        schema: ChannelReadStatusSchema,
      },
      {
        name: ScheduledMessageSchemaClass.name,
        schema: ScheduledMessageSchema,
      },
    ]),
    forwardRef(() => WorldsModule), // circular: WorldsModule → WorldWeatherModule → ChatModule → WorldsModule
    // 6.8b — getGroupsWithChannels enrichuje ikonu character kanálu portrétem
    // postavy (charactersService.getDirectory). forwardRef kvůli cyklu
    // ChatModule → CharactersModule → WorldsModule → … → ChatModule.
    forwardRef(() => CharactersModule),
    // ChatService konzumuje PushService — PushModule je @Global, ale
    // importujeme ho explicitně (soběstačnost v částečných e2e grafech).
    PushModule,
    // 6.2b — ChatController konzumuje UploadService pro world-chat přílohy.
    // forwardRef kvůli cyklu (UploadController používá ChatService).
    forwardRef(() => UploadModule),
    // 11.2-ext fix — JwtService pro ChatGateway.handleConnection (join user: room).
    // forwardRef kvůli cyklu: AuthModule → UsersModule → WorldsModule → … →
    // ChatModule. Bez něj je AuthModule při startu undefined a Nest spadne.
    forwardRef(() => AuthModule),
    // W-3 dokončení — IUsersRepository pro ChatGateway (presence username/avatar
    // ze serveru, ne z klientského payloadu). forwardRef kvůli stejnému cyklu.
    forwardRef(() => UsersModule),
  ],
  controllers: [
    ChatController,
    ChatFeedController,
    ScheduledMessagesController,
  ],
  providers: [
    ChatService,
    // D-066 (spec 20B B4b) — moderace chatové zprávy (M2/M3 skrytí, M4 smazání).
    ChatModerationEnforcementListener,
    ChatPresenceService,
    { provide: 'IChatGroupRepository', useClass: MongoChatGroupRepository },
    { provide: 'IChatChannelRepository', useClass: MongoChatChannelRepository },
    { provide: 'IChatMessageRepository', useClass: MongoChatMessageRepository },
    {
      provide: 'IChannelReadStatusRepository',
      useClass: MongoChannelReadStatusRepository,
    },
    {
      provide: 'IScheduledMessageRepository',
      useClass: MongoScheduledMessageRepository,
    },
    ScheduledMessagesJob,
    ChatGateway,
  ],
  exports: [
    ChatService,
    'IChatGroupRepository', // 14.7c — world-export
    'IChatChannelRepository',
    'IChatMessageRepository',
    'IChannelReadStatusRepository', // 20.5b — admin chat reuse read-state pro unread badge
  ],
})
export class ChatModule {}
