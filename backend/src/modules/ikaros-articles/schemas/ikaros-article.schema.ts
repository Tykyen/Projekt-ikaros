import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

class ArticleRatingSchema {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true, min: 1, max: 5 }) stars: number;
}

export type IkarosArticleDocument = HydratedDocument<IkarosArticleSchemaClass>;

@Schema({ collection: 'ikaros_articles' })
export class IkarosArticleSchemaClass {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) content: string;
  @Prop({ default: 'Ostatni' }) category: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ default: 'Draft' }) status: string;
  @Prop() rejectReason?: string;
  @Prop({ type: [ArticleRatingSchema], default: [] }) ratings: ArticleRatingSchema[];
  @Prop({ default: 0 }) averageRating: number;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop({ default: () => new Date() }) updatedAtUtc: Date;
  @Prop() publishedAtUtc?: Date;
}

export const IkarosArticleSchema = SchemaFactory.createForClass(IkarosArticleSchemaClass);
IkarosArticleSchema.index({ authorId: 1 });
IkarosArticleSchema.index({ status: 1, createdAtUtc: -1 });
