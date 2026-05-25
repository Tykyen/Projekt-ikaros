import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { WorldNewsType } from '../interfaces/world-news.interface';

export type WorldNewsDocument = HydratedDocument<WorldNewsSchemaClass>;

@Schema({ collection: 'worldnews', timestamps: false })
export class WorldNewsSchemaClass {
  @Prop({ type: String, default: null }) worldId: string | null;
  @Prop({ required: true, maxlength: 200 }) title: string;
  @Prop({ required: true, maxlength: 10000 }) content: string;
  @Prop({ required: true }) date: string;
  @Prop({
    type: String,
    enum: ['info', 'alert', 'system'],
    default: 'info',
  })
  type: WorldNewsType;
  @Prop() link?: string;
  // 9.5 — interní link na wiki stránku světa (slug). Priorita před `link`.
  @Prop({ default: null, type: String }) linkPageSlug: string | null;
  // 9.5 — hero obrázek + focal point (parita s 9.1 game events).
  @Prop({ default: null, type: String }) imageUrl: string | null;
  @Prop({ default: null, type: Number }) imageFocalX: number | null;
  @Prop({ default: null, type: Number }) imageFocalY: number | null;
  // 9.5+ — zoom v procentech (25–400, default null = 100 = cover).
  @Prop({ default: null, type: Number }) imageZoom: number | null;
  // 9.5+ — fit režim: 'cover' (default, vyplnit) nebo 'contain' (vidět celý).
  @Prop({ default: null, type: String, enum: ['cover', 'contain', null] })
  imageFit: 'cover' | 'contain' | null;
  // 9.2e — fantasy datum (slug kalendáře + structured object).
  // Pokud `calendarDate` nastaveno, FE preferuje před `date` (real-world).
  @Prop({ default: null, type: String }) calendarConfigId: string | null;
  @Prop({ default: null, type: Object })
  calendarDate: {
    year: number;
    monthIndex: number;
    day: number;
    hour?: number;
    minute?: number;
  } | null;
  @Prop() createdBy?: string;
  // 5.5b — archiv. Legacy dokumenty bez pole = aktivní (filtr `$ne: true`).
  @Prop({ type: Boolean, default: false, index: true }) archived: boolean;
  @Prop() archivedAtUtc?: Date;
  @Prop() archivedByUserId?: string;
}

export const WorldNewsSchema =
  SchemaFactory.createForClass(WorldNewsSchemaClass);
WorldNewsSchema.index({ worldId: 1, date: -1 });
WorldNewsSchema.index({ worldId: 1, archived: 1, date: -1 });
