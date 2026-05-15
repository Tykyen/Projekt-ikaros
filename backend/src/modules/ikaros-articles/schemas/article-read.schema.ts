import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Spec 3.2a — per-user-per-article tracking „kdo už dočetl". Upsertovaný
 * při `POST /ikaros-articles/:id/mark-read` (triggered FE
 * IntersectionObserverem na detail page po 50 % + 30 s).
 */
@Schema({ collection: 'article_reads' })
export class ArticleReadSchemaClass {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) articleId: string;
  @Prop({ default: () => new Date() }) readAt: Date;
}

export type ArticleReadDocument = HydratedDocument<ArticleReadSchemaClass>;

export const ArticleReadSchema = SchemaFactory.createForClass(
  ArticleReadSchemaClass,
);

ArticleReadSchema.index({ userId: 1 });
ArticleReadSchema.index({ articleId: 1 });
ArticleReadSchema.index({ userId: 1, articleId: 1 }, { unique: true });
