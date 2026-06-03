import { Module, OnModuleInit } from '@nestjs/common';
import { FriendshipsService } from './friendships.service';
import { FriendshipsController } from './friendships.controller';
import { FriendshipsGateway } from './friendships.gateway';
import { FriendshipsPendingActionProvider } from './friendships-pending-action.provider';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
import { PendingActionsModule } from '../pending-actions/pending-actions.module';
import { FriendshipsRepositoryModule } from './friendships-repository.module';

@Module({
  imports: [
    // FriendshipsModule má tvrdou závislost na PendingActionsService —
    // importuje PendingActionsModule explicitně, aby byl modul soběstačný
    // i v částečných module grafech (e2e test apps).
    PendingActionsModule,
    // Schema + Mongo repository (bezzávislostní modul — viz jeho doc).
    FriendshipsRepositoryModule,
  ],
  controllers: [FriendshipsController],
  providers: [
    FriendshipsService,
    FriendshipsGateway,
    FriendshipsPendingActionProvider,
  ],
  exports: [
    FriendshipsService,
    // Pro DataExportModule (GDPR export agreguje friend data).
    FriendshipsRepositoryModule,
  ],
})
export class FriendshipsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly friendsProvider: FriendshipsPendingActionProvider,
  ) {}

  onModuleInit() {
    this.pendingActions.register(this.friendsProvider);
  }
}
