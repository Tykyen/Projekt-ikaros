import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FriendshipSchemaClass,
  FriendshipSchema,
} from './schemas/friendship.schema';
import {
  FriendBlockSchemaClass,
  FriendBlockSchema,
} from './schemas/friend-block.schema';
import { MongoFriendshipsRepository } from './repositories/friendships.repository';
import { MongoFriendBlocksRepository } from './repositories/friend-blocks.repository';

/**
 * Samostatný modul jen s friendship repositories (schema + Mongo provider).
 *
 * Nemá žádnou závislost na service vrstvě — díky tomu ho mohou importovat
 * `UsersModule` i `IkarosMessagesModule` (D-057 friend-only check) bez
 * cyklu, který by vznikl při importu celého `FriendshipsModule`
 * (jeho `FriendshipsPendingActionProvider` potřebuje `UsersService`).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FriendshipSchemaClass.name, schema: FriendshipSchema },
      { name: FriendBlockSchemaClass.name, schema: FriendBlockSchema },
    ]),
  ],
  providers: [
    {
      provide: 'IFriendshipsRepository',
      useClass: MongoFriendshipsRepository,
    },
    {
      provide: 'IFriendBlocksRepository',
      useClass: MongoFriendBlocksRepository,
    },
  ],
  exports: ['IFriendshipsRepository', 'IFriendBlocksRepository'],
})
export class FriendshipsRepositoryModule {}
