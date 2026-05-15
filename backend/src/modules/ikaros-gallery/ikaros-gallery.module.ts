import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosGallerySchemaClass,
  IkarosGallerySchema,
} from './schemas/ikaros-gallery.schema';
import {
  GalleryCategorySchemaClass,
  GalleryCategorySchema,
} from './schemas/gallery-category.schema';
import { MongoIkarosGalleryRepository } from './repositories/ikaros-gallery.repository';
import { MongoGalleryCategoriesRepository } from './repositories/gallery-categories.repository';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { GalleryCategoriesService } from './gallery-categories.service';
import { IkarosGalleryController } from './ikaros-gallery.controller';
import { GalleryCategoriesController } from './gallery-categories.controller';
import { GalleryCategoriesSeed } from './gallery-categories.seed';
import { GalleryReviewProvider } from './gallery-review.provider';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';
import { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { UploadModule } from '../upload/upload.module';
import { UploadService } from '../upload/upload.service';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosGallerySchemaClass.name, schema: IkarosGallerySchema },
      { name: GalleryCategorySchemaClass.name, schema: GalleryCategorySchema },
    ]),
    IkarosMessagesModule,
    UploadModule,
  ],
  controllers: [IkarosGalleryController, GalleryCategoriesController],
  providers: [
    IkarosGalleryService,
    GalleryCategoriesService,
    GalleryCategoriesSeed,
    GalleryReviewProvider,
    {
      provide: 'IIkarosGalleryRepository',
      useClass: MongoIkarosGalleryRepository,
    },
    {
      provide: 'IGalleryCategoriesRepository',
      useClass: MongoGalleryCategoriesRepository,
    },
    {
      provide: 'GalleryCategoriesService',
      useExisting: GalleryCategoriesService,
    },
    { provide: 'IkarosMessagesService', useExisting: IkarosMessagesService },
    { provide: 'UploadService', useExisting: UploadService },
  ],
})
export class IkarosGalleryModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: GalleryReviewProvider,
  ) {}

  /**
   * Spec 3.3b — registrace `GalleryReviewProvider` v globální
   * `PendingActionsService` (queue typ `gallery_pending_review`).
   */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
