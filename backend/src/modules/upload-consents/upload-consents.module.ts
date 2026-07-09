import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  UploadConsentSchemaClass,
  UploadConsentSchema,
} from './schemas/upload-consent.schema';
import { MongoUploadConsentsRepository } from './repositories/upload-consents.repository';
import { UploadConsentsService } from './upload-consents.service';

/**
 * Spec 20D (D3) — modul audit logu souhlasů při uploadu (`upload_consents`).
 * Exportuje `UploadConsentsService`, aby ho ostatní moduly (galerie teď;
 * avatary / page-images později) mohly volat při uploadu.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UploadConsentSchemaClass.name, schema: UploadConsentSchema },
    ]),
  ],
  providers: [
    UploadConsentsService,
    {
      provide: 'IUploadConsentsRepository',
      useClass: MongoUploadConsentsRepository,
    },
  ],
  exports: [UploadConsentsService],
})
export class UploadConsentsModule {}
