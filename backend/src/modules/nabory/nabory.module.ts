import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NaborSchemaClass, NaborSchema } from './schemas/nabor.schema';
import { MongoNaboryRepository } from './repositories/nabory.repository';
import { NaboryService } from './nabory.service';
import { NaboryController } from './nabory.controller';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';
import { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';

/**
 * 19.3 — nástěnka náborů (LFG). Vlastní platformová entita; „Ozvat se" reuse
 * `IkarosMessagesService`. Moderace = ADMIN_ROLES (Superadmin/Admin/Spr. diskuzí).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NaborSchemaClass.name, schema: NaborSchema },
    ]),
    IkarosMessagesModule,
  ],
  controllers: [NaboryController],
  providers: [
    NaboryService,
    { provide: 'INaboryRepository', useClass: MongoNaboryRepository },
    { provide: 'IkarosMessagesService', useExisting: IkarosMessagesService },
  ],
  exports: ['INaboryRepository'],
})
export class NaboryModule {}
