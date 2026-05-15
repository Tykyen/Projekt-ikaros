import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Spec 3.2a — dynamicky spravované kategorie článků. Nahrazuje hardcoded
 * enum v `CreateArticleDto`. Admin/Superadmin spravuje přes
 * `/api/article-categories` CRUD. Seed 6 výchozích (povidky, poezie, uvahy,
 * recenze, postavy, ostatni) v `ArticleCategoriesSeed` (OnApplicationBootstrap).
 */
@Schema({ collection: 'article_categories' })
export class ArticleCategorySchemaClass {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) color: string;
  @Prop({ required: true }) order: number;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
}

export type ArticleCategoryDocument =
  HydratedDocument<ArticleCategorySchemaClass>;

export const ArticleCategorySchema = SchemaFactory.createForClass(
  ArticleCategorySchemaClass,
);

ArticleCategorySchema.index({ order: 1 });
