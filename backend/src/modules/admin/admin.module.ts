import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PagesModule } from '../pages/pages.module';
import { WorldsModule } from '../worlds/worlds.module';
import { AuthModule } from '../auth/auth.module';
import {
  AdminAuditLogSchemaClass,
  AdminAuditLogSchema,
} from './schemas/admin-audit-log.schema';
import { MongoAdminAuditLogRepository } from './repositories/admin-audit-log.repository';
import { AccountCleanupCron } from '../users/services/account-cleanup.cron';

@Module({
  imports: [
    PagesModule,
    WorldsModule,
    AuthModule, // IRefreshTokenRepository pro banUser/resetPassword revoke
    MongooseModule.forFeature([
      { name: AdminAuditLogSchemaClass.name, schema: AdminAuditLogSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
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
