import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ArticleVersionDocument =
  HydratedDocument<ArticleVersionSchemaClass>;

/**
 * D-NEW-article-versions — Snapshot článku při každém update. Slouží pro
 * historii editů, rollback a diff view. Ukládá full title+content+category;
 * při velkém článku stojí pár KB, ale diskový prostor je levný.
 *
 * Záznam vzniká v `IkarosArticlesService.update` před aplikací změn (před,
 * ne po — abychom uchovali stav, který byl). Smaže se kaskádou při delete
 * článku.
 */
@Schema({ collection: 'article_versions', timestamps: true })
export class ArticleVersionSchemaClass {
  @Prop({ required: true }) articleId: string;
  /** Pořadové číslo revize (1, 2, 3, …). 0 = první vznik. */
  @Prop({ required: true }) revision: number;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) content: string;
  @Prop({ required: true }) category: string;
  @Prop({ required: true }) status: string;
  /** Kdo provedl update (snapshotuje stav PŘED update). */
  @Prop({ required: true }) editedBy: string;
  @Prop({ required: true }) editedByName: string;
}

export const ArticleVersionSchema = SchemaFactory.createForClass(
  ArticleVersionSchemaClass,
);
ArticleVersionSchema.index({ articleId: 1, revision: -1 });
