import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ArticleCategorySchemaClass,
  ArticleCategorySchema,
} from './schemas/article-category.schema';
import { IkarosCategoriesService } from './ikaros-categories.service';
import { IkarosCategoriesController } from './ikaros-categories.controller';
import { MongoArticleCategoriesRepository } from './repositories/article-categories.repository';
import { ArticleCategoriesSeed } from './article-categories.seed';
import { IkarosArticlesModule } from '../ikaros-articles/ikaros-articles.module';

/**
 * Spec 3.2a — modul pro dynamicky spravované kategorie článků. Refactor
 * z hardcoded enumu v `CreateArticleDto`.
 *
 * IkarosArticlesModule injectuje `IkarosCategoriesService` pro validaci
 * `category` při create/update — forwardRef kvůli cyklické závislosti
 * (articles repo countByCategory → použije categories validation).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ArticleCategorySchemaClass.name,
        schema: ArticleCategorySchema,
      },
    ]),
    forwardRef(() => IkarosArticlesModule),
  ],
  controllers: [IkarosCategoriesController],
  providers: [
    IkarosCategoriesService,
    ArticleCategoriesSeed,
    {
      provide: 'IArticleCategoriesRepository',
      useClass: MongoArticleCategoriesRepository,
    },
  ],
  exports: [IkarosCategoriesService, 'IArticleCategoriesRepository'],
})
export class IkarosCategoriesModule {}
