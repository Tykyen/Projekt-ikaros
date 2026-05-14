import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SearchIndexStatsDocument =
  HydratedDocument<SearchIndexStatsSchemaClass>;

@Schema({ collection: 'search_index_stats' })
export class SearchIndexStatsSchemaClass {
  @Prop({ required: true }) _id: string;
  @Prop({ default: 'embedding' }) provider: string;
  @Prop({ default: 'Unknown' }) status: string;
  @Prop({ default: 0 }) processedPages: number;
  @Prop({ default: 0 }) totalPages: number;
  @Prop({ default: 0 }) indexedCount: number;
  @Prop({ default: 0 }) vectorCount: number;
  @Prop({ default: 0 }) pendingPages: number;
  @Prop() lastEmbeddedPageSlug?: string;
  @Prop() lastEmbeddedAtUtc?: Date;
}

export const SearchIndexStatsSchema = SchemaFactory.createForClass(
  SearchIndexStatsSchemaClass,
);

export type IndexingFailureDocument =
  HydratedDocument<IndexingFailureSchemaClass>;

@Schema({ collection: 'indexing_failures', timestamps: true })
export class IndexingFailureSchemaClass {
  @Prop({ required: true }) pageId: string;
  @Prop({ required: true }) slug: string;
  @Prop({ required: true }) error: string;
  @Prop({ default: Date.now }) timestamp: Date;
}

export const IndexingFailureSchema = SchemaFactory.createForClass(
  IndexingFailureSchemaClass,
);
