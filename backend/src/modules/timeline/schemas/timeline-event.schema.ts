import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { CelestialOverride } from '../interfaces/timeline-event.interface';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type TimelineEventDocument = HydratedDocument<TimelineEventSchemaClass>;

@Schema({ timestamps: true, collection: 'timeline_events' })
export class TimelineEventSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) year: number;
  @Prop({ required: true, min: 1 }) month: number;
  @Prop({ required: true, min: 1 }) day: number;
  @Prop({ type: Number, default: null }) hour: number | null;
  @Prop({ required: true, maxlength: 200 }) title: string;
  @Prop({ required: true, maxlength: 50000 }) text: string;
  @Prop({ type: String, default: null }) imageUrl: string | null;
  // 9.3 — focal point obrázku (0–100, null = center 50/50).
  @Prop({ type: Number, default: null }) imageFocalX: number | null;
  @Prop({ type: Number, default: null }) imageFocalY: number | null;
  @Prop({ type: String, default: null }) link: string | null;
  // 9.3 — interní wiki link (slug stránky světa). Nezávislý na `link`.
  @Prop({ type: String, default: null }) pageSlug: string | null;
  @Prop({ type: [MixedArraySubSchema], default: (): CelestialOverride[] => [] })
  celestialOverrides: CelestialOverride[];
}

export const TimelineEventSchema = SchemaFactory.createForClass(
  TimelineEventSchemaClass,
);
TimelineEventSchema.index({ worldId: 1, year: 1, month: 1, day: 1 });
