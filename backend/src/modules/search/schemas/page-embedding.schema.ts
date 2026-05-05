import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PageEmbeddingDocument = HydratedDocument<PageEmbeddingSchemaClass>;

@Schema({ collection: 'page_embeddings', timestamps: { createdAt: true, updatedAt: false } })
export class PageEmbeddingSchemaClass {
  @Prop({ required: true, index: true }) pageId: string;
  @Prop({ required: true }) slug: string;
  @Prop({ required: true, index: true }) modelKey: string;
  @Prop({ required: true }) pageHash: string;
  @Prop({ required: true }) chunkId: string;
  @Prop({ required: true }) chunkTitle: string;
  @Prop({ required: true }) chunkPreview: string;
  @Prop({ required: true }) chunkOrder: number;
  @Prop({ type: [Number], required: true }) vector: number[];
  createdAt: Date;
}

export const PageEmbeddingSchema = SchemaFactory.createForClass(PageEmbeddingSchemaClass);
PageEmbeddingSchema.index({ pageId: 1, modelKey: 1 });
