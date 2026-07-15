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
// 22.4 vitrína — wiki stránky vitrínových světů do sitemapy.
import { PageSchemaClass, PageSchema } from '../pages/schemas/page.schema';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldSchemaClass.name, schema: WorldSchema },
      { name: IkarosArticleSchemaClass.name, schema: IkarosArticleSchema },
      { name: IkarosGallerySchemaClass.name, schema: IkarosGallerySchema },
      { name: PageSchemaClass.name, schema: PageSchema },
    ]),
  ],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
