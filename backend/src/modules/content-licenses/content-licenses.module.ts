import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ContentLicenseSchemaClass,
  ContentLicenseSchema,
} from './schemas/content-license.schema';
import { MongoContentLicensesRepository } from './repositories/content-licenses.repository';
import { ContentLicensesService } from './content-licenses.service';

/**
 * Spec 20D (D4) — modul licenční karty (`content_licenses`). PODKLAD: jen
 * model + repo + service s verzováním; NENAPOJENO na galerii/knihovnu ani UI.
 * Exportuje service + repo token, aby 21.5 mohla napojit klonování/genealogii.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContentLicenseSchemaClass.name, schema: ContentLicenseSchema },
    ]),
  ],
  providers: [
    ContentLicensesService,
    {
      provide: 'IContentLicensesRepository',
      useClass: MongoContentLicensesRepository,
    },
  ],
  exports: [ContentLicensesService, 'IContentLicensesRepository'],
})
export class ContentLicensesModule {}
