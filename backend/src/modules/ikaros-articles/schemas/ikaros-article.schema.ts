import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

class ArticleRatingSchema {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true, min: 1, max: 5 }) stars: number;
  // 3.4f — recenze: denormalizované jméno + volitelný text
  @Prop({ default: '' }) userName: string;
  @Prop({ default: '' }) text: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
}

export type IkarosArticleDocument = HydratedDocument<IkarosArticleSchemaClass>;

@Schema({ collection: 'ikaros_articles' })
export class IkarosArticleSchemaClass {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) content: string;
  @Prop({ default: 'ostatni' }) category: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ default: 'Draft' }) status: string;
  @Prop() rejectReason?: string;
  @Prop({ type: [ArticleRatingSchema], default: [] })
  ratings: ArticleRatingSchema[];
  @Prop({ default: 0 }) averageRating: number;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop({ default: () => new Date() }) updatedAtUtc: Date;
  @Prop() publishedAtUtc?: Date;
  // B4b (spec 20B) — moderační skrytí (akce M2/M3). Skrytý článek se ve
  // veřejných read cestách vynechá; vidí ho jen reviewer set. Default false.
  @Prop({ default: false }) moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
}

export const IkarosArticleSchema = SchemaFactory.createForClass(
  IkarosArticleSchemaClass,
);
IkarosArticleSchema.index({ authorId: 1 });
IkarosArticleSchema.index({ status: 1, createdAtUtc: -1 });
// D-NEW-search-be — Mongo $text index pro server-side fulltext search.
// FE `useArticles({ search })` triggeruje BE `?search=` query, která místo
// client-side filtru vrátí jen relevantní výsledky. Vhodné při ~500+ článků.
IkarosArticleSchema.index({ title: 'text', content: 'text' });
