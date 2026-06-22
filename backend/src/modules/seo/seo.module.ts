import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldSchemaClass, WorldSchema } from '../worlds/schemas/world.schema';
import {
  IkarosArticleSchemaClass,
  IkarosArticleSchema,
} from '../ikaros-articles/schemas/ikaros-article.schema';
import {
  IkarosGallerySchemaClass,
  IkarosGallerySchema,
} from '../ikaros-gallery/schemas/ikaros-gallery.schema';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldSchemaClass.name, schema: WorldSchema },
      { name: IkarosArticleSchemaClass.name, schema: IkarosArticleSchema },
      { name: IkarosGallerySchemaClass.name, schema: IkarosGallerySchema },
    ]),
  ],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
