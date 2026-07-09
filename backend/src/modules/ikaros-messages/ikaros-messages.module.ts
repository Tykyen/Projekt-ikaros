import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosMessageSchemaClass,
  IkarosMessageSchema,
} from './schemas/ikaros-message.schema';
import { MongoIkarosMessagesRepository } from './repositories/ikaros-messages.repository';
import { IkarosMessagesService } from './ikaros-messages.service';
import { IkarosMessagesGateway } from './ikaros-messages.gateway';
import { IkarosMessagesController } from './ikaros-messages.controller';
import { SystemEventsListener } from './system-events.listener';
import { IkarosMessagesModerationEnforcementListener } from './moderation-enforcement.listener';
import { AuthModule } from '../auth/auth.module';
import { FriendshipsRepositoryModule } from '../friendships/friendships-repository.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosMessageSchemaClass.name, schema: IkarosMessageSchema },
    ]),
    AuthModule,
    // D-057 — friend-only check příjemce. UsersService je @Global.
    FriendshipsRepositoryModule,
  ],
  controllers: [IkarosMessagesController],
  providers: [
    IkarosMessagesService,
    {
      provide: 'IIkarosMessagesRepository',
      useClass: MongoIkarosMessagesRepository,
    },
    IkarosMessagesGateway,
    SystemEventsListener,
    // B5 — enforcement moderačních zásahů nad zprávami pošty (M4 odstranění).
    IkarosMessagesModerationEnforcementListener,
  ],
  exports: [IkarosMessagesService],
})
export class IkarosMessagesModule {}
