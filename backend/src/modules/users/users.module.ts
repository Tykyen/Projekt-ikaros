import { Global, Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchemaClass, UserSchema } from './schemas/user.schema';
import {
  UsernameChangeRequestSchemaClass,
  UsernameChangeRequestSchema,
} from './schemas/username-change-request.schema';
import { MongoUsersRepository } from './users.repository';
import { MongoUsernameChangeRequestsRepository } from './repositories/username-change-requests.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserBanCacheService } from './services/user-ban-cache.service';
import { UsersModerationEnforcementListener } from './moderation-enforcement.listener';
import { WorldsModule } from '../worlds/worlds.module';
import { CharactersModule } from '../characters/characters.module';
import { FriendshipsRepositoryModule } from '../friendships/friendships-repository.module';
import { MailerModule } from '../mailer/mailer.module';
import { SecurityTokensModule } from '../security-tokens/security-tokens.module';
import { UploadModule } from '../upload/upload.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserSchemaClass.name, schema: UserSchema },
      {
        name: UsernameChangeRequestSchemaClass.name,
        schema: UsernameChangeRequestSchema,
      },
    ]),
    // WorldsModule poskytuje IWorldMembershipRepository.
    // forwardRef kvůli vzájemné cirkularitě (WorldsModule importuje UsersModule taky forwardRef).
    forwardRef(() => WorldsModule),
    // 8.3 / D-075 — CharactersModule poskytuje ICharactersRepository pro
    // cross-world aggregator `GET /users/me/characters`. forwardRef kvůli
    // řetězci UsersModule → CharactersModule → WorldsModule → UsersModule.
    forwardRef(() => CharactersModule),
    // D-057 — friendship repository pro friend-only profil check.
    // Bezzávislostní modul → žádný cyklus s FriendshipsModule.
    FriendshipsRepositoryModule,
    // UsersService konzumuje MailerService + SecurityTokensService —
    // moduly jsou @Global, ale importujeme je explicitně, aby UsersModule
    // byl soběstačný i v částečných module grafech (e2e test apps).
    MailerModule,
    SecurityTokensModule,
    // 1.3a — UsersController konzumuje UploadService pro avatar endpointy.
    UploadModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserBanCacheService,
    // B4b — vynucení account-level moderačních zásahů (M5/M6/M7 → ban/unban).
    UsersModerationEnforcementListener,
    { provide: 'IUsersRepository', useClass: MongoUsersRepository },
    {
      provide: 'IUsernameChangeRequestsRepository',
      useClass: MongoUsernameChangeRequestsRepository,
    },
  ],
  exports: [
    'IUsersRepository',
    'IUsernameChangeRequestsRepository',
    UsersService,
    UserBanCacheService,
  ],
})
export class UsersModule {}
