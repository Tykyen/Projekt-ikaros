import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminStatsService } from './admin-stats.service';
import { PagesModule } from '../pages/pages.module';
import { WorldsModule } from '../worlds/worlds.module';
import { AuthModule } from '../auth/auth.module';
import { IkarosArticlesModule } from '../ikaros-articles/ikaros-articles.module';
import { IkarosGalleryModule } from '../ikaros-gallery/ikaros-gallery.module';
import { IkarosDiscussionsModule } from '../ikaros-discussions/ikaros-discussions.module';
import {
  AdminAuditLogSchemaClass,
  AdminAuditLogSchema,
} from './schemas/admin-audit-log.schema';
import { MongoAdminAuditLogRepository } from './repositories/admin-audit-log.repository';
import { AccountCleanupCron } from '../users/services/account-cleanup.cron';
import { AdminFriendshipsService } from './admin-friendships.service';
import { FriendshipsRepositoryModule } from '../friendships/friendships-repository.module';

@Module({
  imports: [
    PagesModule,
    WorldsModule,
    AuthModule, // IRefreshTokenRepository pro banUser/resetPassword revoke
    // 12.1 — admin dashboard statistiky (countAll content repos).
    IkarosArticlesModule,
    IkarosGalleryModule,
    IkarosDiscussionsModule,
    // D-056 (N-6b) — admin friendships lookup/reset (friendships + blocks repo).
    FriendshipsRepositoryModule,
    MongooseModule.forFeature([
      { name: AdminAuditLogSchemaClass.name, schema: AdminAuditLogSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminStatsService,
    AdminFriendshipsService,
    AccountCleanupCron,
    {
      provide: 'IAdminAuditLogRepository',
      useClass: MongoAdminAuditLogRepository,
    },
  ],
  // Pro DataExportModule (GDPR export potřebuje audit log repo).
  exports: ['IAdminAuditLogRepository'],
})
export class AdminModule {}
