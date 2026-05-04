import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IkarosGallerySchemaClass, IkarosGallerySchema } from './schemas/ikaros-gallery.schema';
import { MongoIkarosGalleryRepository } from './repositories/ikaros-gallery.repository';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { IkarosGalleryController } from './ikaros-gallery.controller';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';
import { UploadModule } from '../upload/upload.module';
import { UploadService } from '../upload/upload.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosGallerySchemaClass.name, schema: IkarosGallerySchema },
    ]),
    IkarosMessagesModule,
    UploadModule,
  ],
  controllers: [IkarosGalleryController],
  providers: [
    IkarosGalleryService,
    { provide: 'IIkarosGalleryRepository', useClass: MongoIkarosGalleryRepository },
    { provide: 'IkarosMessagesService', useExisting: 'IkarosMessagesService' },
    { provide: 'UploadService', useExisting: 'UploadService' },
  ],
})
export class IkarosGalleryModule {}
