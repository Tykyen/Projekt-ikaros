import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosArticleSchemaClass,
  IkarosArticleSchema,
} from './schemas/ikaros-article.schema';
import {
  ArticleReadSchemaClass,
  ArticleReadSchema,
} from './schemas/article-read.schema';
import {
  ArticleVersionSchemaClass,
  ArticleVersionSchema,
} from './schemas/article-version.schema';
import { MongoIkarosArticlesRepository } from './repositories/ikaros-articles.repository';
import { MongoArticleReadsRepository } from './repositories/article-reads.repository';
import { ArticleVersionsRepository } from './repositories/article-versions.repository';
import { IkarosArticlesService } from './ikaros-articles.service';
import { IkarosArticlesController } from './ikaros-articles.controller';
import { ArticleReviewProvider } from './article-review.provider';
import { ArticlesModerationEnforcementListener } from './moderation-enforcement.listener';
import { ArticleCategorySlugMigration } from './article-category-slug-migration';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';
import { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
import { IkarosCategoriesModule } from '../ikaros-categories/ikaros-categories.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosArticleSchemaClass.name, schema: IkarosArticleSchema },
      { name: ArticleReadSchemaClass.name, schema: ArticleReadSchema },
      {
        name: ArticleVersionSchemaClass.name,
        schema: ArticleVersionSchema,
      },
    ]),
    IkarosMessagesModule,
    forwardRef(() => IkarosCategoriesModule),
  ],
  controllers: [IkarosArticlesController],
  providers: [
    IkarosArticlesService,
    ArticleReviewProvider,
    // B4b — enforcement moderačních zásahů nad články (skrytí/smazání).
    ArticlesModerationEnforcementListener,
    ArticleCategorySlugMigration,
    ArticleVersionsRepository,
    {
      provide: 'IIkarosArticlesRepository',
      useClass: MongoIkarosArticlesRepository,
    },
    {
      provide: 'IArticleReadsRepository',
      useClass: MongoArticleReadsRepository,
    },
    { provide: 'IkarosMessagesService', useExisting: IkarosMessagesService },
  ],
  exports: ['IIkarosArticlesRepository'],
})
export class IkarosArticlesModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: ArticleReviewProvider,
  ) {}

  /**
   * Spec 3.2a — registrace `ArticleReviewProvider` v globální
   * `PendingActionsService` (queue typ `article_pending_review`).
   */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
