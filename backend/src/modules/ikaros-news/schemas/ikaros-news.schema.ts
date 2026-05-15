import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { IkarosNewsType } from '../interfaces/ikaros-news.interface';

export type IkarosNewsDocument = HydratedDocument<IkarosNewsSchemaClass>;

@Schema({ collection: 'ikaros_news' })
export class IkarosNewsSchemaClass {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) content: string;
  // Spec 3.1b — typ novinky (barva nadpisu na FE). Legacy dokumenty bez pole
  // se čtou jako 'info' (default + fallback v repository.toEntity).
  // `type: String` explicitně — union typ nelze odvodit z TS reflexe.
  @Prop({
    type: String,
    enum: ['info', 'warning', 'system'],
    default: 'info',
    index: true,
  })
  type: IkarosNewsType;
  // Spec 3.1b — URL obrázku (Cloudinary, nahráno přes POST /upload/image).
  @Prop() imageUrl?: string;
  @Prop({ required: true }) authorId: string;
  // Legacy denormalizovaný snapshot. Nové zápisy ho neukládají — username
  // se joinuje z Users při čtení. Zachováno jako fallback pro pre-2026-05-06 data.
  @Prop() authorName?: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  // Spec 3.1 — archiv (revertibilní soft toggle). Existující dokumenty bez
  // tohoto pole se chovají jako `archived: false` díky filteru `{ archived: { $ne: true } }`.
  @Prop({ default: false, index: true }) archived: boolean;
  @Prop() archivedAtUtc?: Date;
  @Prop() archivedByUserId?: string;
}

export const IkarosNewsSchema = SchemaFactory.createForClass(
  IkarosNewsSchemaClass,
);
IkarosNewsSchema.index({ createdAtUtc: -1 });
