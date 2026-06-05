import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosNewsSchemaClass,
  IkarosNewsSchema,
} from './schemas/ikaros-news.schema';
import { MongoIkarosNewsRepository } from './repositories/ikaros-news.repository';
import { IkarosNewsService } from './ikaros-news.service';
import { IkarosNewsController } from './ikaros-news.controller';
import { IkarosNewsGateway } from './ikaros-news.gateway';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosNewsSchemaClass.name, schema: IkarosNewsSchema },
    ]),
    // D-067 — přístup k IAdminAuditLogRepository pro audit novinek.
    AdminModule,
  ],
  controllers: [IkarosNewsController],
  providers: [
    IkarosNewsService,
    IkarosNewsGateway,
    { provide: 'IIkarosNewsRepository', useClass: MongoIkarosNewsRepository },
  ],
})
export class IkarosNewsModule {}
