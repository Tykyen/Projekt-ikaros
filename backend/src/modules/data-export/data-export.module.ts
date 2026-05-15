import { Module } from '@nestjs/common';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { FriendshipsModule } from '../friendships/friendships.module';
import { AdminModule } from '../admin/admin.module';
import { WorldsModule } from '../worlds/worlds.module';

/**
 * SP6: GDPR data export (synchronous JSON).
 *
 * Žádné nové schemas — služba agreguje data z existing repositories
 * (UsersRepo, FriendshipsRepo, FriendBlocksRepo, UsernameChangeRequestsRepo,
 * IWorldMembershipRepository, IAdminAuditLogRepository).
 *
 * `IUsersRepository` + `IUsernameChangeRequestsRepository` jsou globální
 * (UsersModule je @Global). Zbylé repo tokeny dodávají importované moduly.
 *
 * Endpoint: GET /api/data-export/me — JWT required.
 *
 * Anti-scope: chat messages, pages content, ZIP, async jobs, admin endpoint
 * — viz design doc 2026-05-14-sp6-data-export-design.md.
 */
@Module({
  imports: [FriendshipsModule, AdminModule, WorldsModule],
  controllers: [DataExportController],
  providers: [DataExportService],
})
export class DataExportModule {}
