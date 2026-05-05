import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PageEmbeddingSchemaClass, PageEmbeddingSchema } from './schemas/page-embedding.schema';
import { SearchIndexStatsSchemaClass, SearchIndexStatsSchema, IndexingFailureSchemaClass, IndexingFailureSchema } from './schemas/search-index-stats.schema';
import { MongoPageEmbeddingRepository } from './repositories/page-embedding.repository';
import { MongoSearchStatsRepository } from './repositories/search-stats.repository';
import { EmbeddingSearchService } from './embedding-search.service';
import { MeiliSearchService } from './meili-search.service';
import { SearchCoordinator } from './search.coordinator';
import { SearchController } from './search.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PageEmbeddingSchemaClass.name, schema: PageEmbeddingSchema },
      { name: SearchIndexStatsSchemaClass.name, schema: SearchIndexStatsSchema },
      { name: IndexingFailureSchemaClass.name, schema: IndexingFailureSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [
    { provide: 'IPageEmbeddingRepository', useClass: MongoPageEmbeddingRepository },
    { provide: 'ISearchStatsRepository', useClass: MongoSearchStatsRepository },
    EmbeddingSearchService,
    MeiliSearchService,
    {
      provide: SearchCoordinator,
      useFactory: (meili: MeiliSearchService, embedding: EmbeddingSearchService) =>
        new SearchCoordinator([meili, embedding]),
      inject: [MeiliSearchService, EmbeddingSearchService],
    },
    {
      provide: 'SearchCoordinator',
      useExisting: SearchCoordinator,
    },
  ],
  exports: [SearchCoordinator, 'SearchCoordinator', 'ISearchStatsRepository'],
})
export class SearchModule {}
