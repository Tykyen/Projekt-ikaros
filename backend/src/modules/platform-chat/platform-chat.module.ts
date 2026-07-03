import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatModule } from '../chat/chat.module';
import { UsersModule } from '../users/users.module';
import { UploadModule } from '../upload/upload.module';
import { PlatformChatService } from './platform-chat.service';
import { PlatformChatController } from './platform-chat.controller';
import { PlatformChatGateway } from './platform-chat.gateway';
import { PlatformDocumentsService } from './platform-documents.service';
import { PlatformDocumentsController } from './platform-documents.controller';
import { AdminTasksService } from './admin-tasks.service';
import { AdminTasksController } from './admin-tasks.controller';
import {
  PlatformDocumentSchemaClass,
  PlatformDocumentSchema,
} from './schemas/platform-document.schema';
import {
  AdminTaskSchemaClass,
  AdminTaskSchema,
} from './schemas/admin-task.schema';

/**
 * 20.5 — interní chat správy platformy: konverzace/zprávy/WS (reuse ChatModule)
 * + sdílené PDF (`platform_documents`, reuse UploadModule) + úkoly týmu
 * (`admin_tasks`). Vše pod prefixem `admin-chat`, jen pro Superadmin + Admin.
 */
@Module({
  imports: [
    ChatModule,
    UsersModule,
    UploadModule,
    MongooseModule.forFeature([
      {
        name: PlatformDocumentSchemaClass.name,
        schema: PlatformDocumentSchema,
      },
      { name: AdminTaskSchemaClass.name, schema: AdminTaskSchema },
    ]),
  ],
  controllers: [
    PlatformChatController,
    PlatformDocumentsController,
    AdminTasksController,
  ],
  providers: [
    PlatformChatService,
    PlatformChatGateway,
    PlatformDocumentsService,
    AdminTasksService,
  ],
})
export class PlatformChatModule {}
