import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosEventDocument = HydratedDocument<IkarosEventSchemaClass>;

/**
 * Spec 2.1b — globální platformové akce. Analog `IkarosNews`. Oddělené od
 * světových `GameEvent` (jiná doména, jiná kolekce).
 */
@Schema({ collection: 'ikaros_events' })
export class IkarosEventSchemaClass {
  @Prop({ required: true, maxlength: 200 }) title: string;
  @Prop({ required: true, type: Date }) date: Date;
  @Prop({ maxlength: 5000 }) description?: string;
  @Prop() imageUrl?: string;
  // 2.1b-focal — střed výřezu obrázku v procentech (0–100).
  @Prop() imageFocalX?: number;
  @Prop() imageFocalY?: number;
  // 9.5+ — zoom v procentech (25–400, default = null = 100 = cover).
  @Prop() imageZoom?: number;
  // 9.5+ — fit režim: 'cover' (default, vyplnit) nebo 'contain' (vidět celý).
  @Prop({ type: String, enum: ['cover', 'contain'] }) imageFit?:
    | 'cover'
    | 'contain';
  @Prop({ default: true }) confirmable: boolean;
  @Prop({ type: [String], default: [] }) attendeeUserIds: string[];
  @Prop({ required: true }) authorId: string;
  // Legacy denormalizace — viz IkarosNews. Nové zápisy neukládají.
  @Prop() authorName?: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop({ default: true, index: true }) isActive: boolean;
}

export const IkarosEventSchema = SchemaFactory.createForClass(
  IkarosEventSchemaClass,
);
// Index pro findActive / findUpcoming (filtr isActive + sort/filter date).
IkarosEventSchema.index({ date: 1, isActive: 1 });
IkarosEventSchema.index({ createdAtUtc: -1 });
