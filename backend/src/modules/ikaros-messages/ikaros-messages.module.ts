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
  ],
  exports: [IkarosMessagesService],
})
export class IkarosMessagesModule {}
