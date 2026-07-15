import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminGrowthService } from './admin-growth.service';
import { AdminThemeUsageService } from './admin-theme-usage.service';
import { AdminCostsService } from './admin-costs.service';
import { PagesModule } from '../pages/pages.module';
import { WorldsModule } from '../worlds/worlds.module';
import { AuthModule } from '../auth/auth.module';
import { IkarosArticlesModule } from '../ikaros-articles/ikaros-articles.module';
import { IkarosGalleryModule } from '../ikaros-gallery/ikaros-gallery.module';
import { IkarosDiscussionsModule } from '../ikaros-discussions/ikaros-discussions.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import {
  AdminAuditLogSchemaClass,
  AdminAuditLogSchema,
} from './schemas/admin-audit-log.schema';
// 19.1 — growth funnel čte napříč kolekcemi (odvozené metriky, žádný nový tracking).
import { UserSchemaClass, UserSchema } from '../users/schemas/user.schema';
import {
  WorldMembershipSchemaClass,
  WorldMembershipSchema,
} from '../worlds/schemas/world-membership.schema';
import {
  CharacterSchemaClass,
  CharacterSchema,
} from '../characters/schemas/character.schema';
import {
  ChatMessageSchemaClass,
  ChatMessageSchema,
} from '../chat/schemas/chat-message.schema';
// 19.2 — počítadla nákladů (počet blobů per typ/svět + přesné byty chat/PDF).
import {
  IkarosGallerySchemaClass,
  IkarosGallerySchema,
} from '../ikaros-gallery/schemas/ikaros-gallery.schema';
import {
  WorldMapEntrySchemaClass,
  WorldMapEntrySchema,
} from '../world-maps/schemas/world-map-entry.schema';
import {
  MapSceneSchemaClass,
  MapSceneSchema,
} from '../maps/schemas/map-scene.schema';
import {
  CustomEmoteDocument,
  CustomEmoteSchema,
} from '../emotes/schemas/custom-emote.schema';
import { PageSchemaClass, PageSchema } from '../pages/schemas/page.schema';
import {
  BestieSchemaClass,
  BestieSchema,
} from '../bestiae/schemas/bestie.schema';
import { WorldSchemaClass, WorldSchema } from '../worlds/schemas/world.schema';
import {
  PlatformDocumentSchemaClass,
  PlatformDocumentSchema,
} from '../platform-chat/schemas/platform-document.schema';
import { MongoAdminAuditLogRepository } from './repositories/admin-audit-log.repository';
import { AccountCleanupCron } from '../users/services/account-cleanup.cron';
import { AdminFriendshipsService } from './admin-friendships.service';
import { FriendshipsRepositoryModule } from '../friendships/friendships-repository.module';
import { UsersIdentityGateway } from './users-identity.gateway';

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
    // 19.1 — akviziční poměr čte anonymní návštěvnost (AnalyticsService export).
    AnalyticsModule,
    MongooseModule.forFeature([
      { name: AdminAuditLogSchemaClass.name, schema: AdminAuditLogSchema },
      // 19.1 growth funnel (read-only agregace napříč doménami).
      { name: UserSchemaClass.name, schema: UserSchema },
      { name: WorldMembershipSchemaClass.name, schema: WorldMembershipSchema },
      { name: CharacterSchemaClass.name, schema: CharacterSchema },
      { name: ChatMessageSchemaClass.name, schema: ChatMessageSchema },
      // 19.2 počítadla nákladů (počty blobů + byty).
      { name: IkarosGallerySchemaClass.name, schema: IkarosGallerySchema },
      { name: WorldMapEntrySchemaClass.name, schema: WorldMapEntrySchema },
      { name: MapSceneSchemaClass.name, schema: MapSceneSchema },
      { name: CustomEmoteDocument.name, schema: CustomEmoteSchema },
      { name: PageSchemaClass.name, schema: PageSchema },
      { name: BestieSchemaClass.name, schema: BestieSchema },
      { name: WorldSchemaClass.name, schema: WorldSchema },
      {
        name: PlatformDocumentSchemaClass.name,
        schema: PlatformDocumentSchema,
      },
    ]),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminStatsService,
    AdminGrowthService,
    AdminThemeUsageService,
    AdminCostsService,
    AdminFriendshipsService,
    AccountCleanupCron,
    UsersIdentityGateway,
    {
      provide: 'IAdminAuditLogRepository',
      useClass: MongoAdminAuditLogRepository,
    },
  ],
  // Pro DataExportModule (GDPR export potřebuje audit log repo).
  exports: ['IAdminAuditLogRepository'],
})
export class AdminModule {}
