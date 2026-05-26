import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type WorldCalendarConfigDocument =
  HydratedDocument<WorldCalendarConfigSchemaClass>;

/**
 * 9.2b — Multi-config kalendáře per svět.
 * Compound `{worldId, slug}` UNIQUE → N configů per svět.
 */
@Schema({ timestamps: true, collection: 'world_calendar_configs' })
export class WorldCalendarConfigSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) slug: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: 24 }) hoursPerDay: number;
  @Prop({ type: [String], default: [] }) daysOfWeek: string[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  months: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  celestialBodies: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  seasons: Record<string, unknown>[];
  // 9.3-F-I — opt-in leap pravidlo (every-4 / solar-hijri-33 / islamic-30).
  @Prop({ type: Object, default: null })
  leapYearRule: { type: string; leapMonthIndex: number } | null;
  // 9.3-F-II — opt-in lunisolar pravidlo (Metonic 19-letý cyklus).
  @Prop({ type: Object, default: null })
  lunisolar: { type: string; leapYearsInCycle: number[] } | null;
  @Prop({ default: 0 }) epochOffset: number;
}

export const WorldCalendarConfigSchema = SchemaFactory.createForClass(
  WorldCalendarConfigSchemaClass,
);
// 9.2b — compound unique pro N configů per svět.
WorldCalendarConfigSchema.index({ worldId: 1, slug: 1 }, { unique: true });
