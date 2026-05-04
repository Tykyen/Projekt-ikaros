import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IkarosArticleSchemaClass, IkarosArticleSchema } from './schemas/ikaros-article.schema';
import { MongoIkarosArticlesRepository } from './repositories/ikaros-articles.repository';
import { IkarosArticlesService } from './ikaros-articles.service';
import { IkarosArticlesController } from './ikaros-articles.controller';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosArticleSchemaClass.name, schema: IkarosArticleSchema },
    ]),
    IkarosMessagesModule,
  ],
  controllers: [IkarosArticlesController],
  providers: [
    IkarosArticlesService,
    { provide: 'IIkarosArticlesRepository', useClass: MongoIkarosArticlesRepository },
    { provide: 'IkarosMessagesService', useExisting: 'IkarosMessagesService' },
  ],
})
export class IkarosArticlesModule {}
