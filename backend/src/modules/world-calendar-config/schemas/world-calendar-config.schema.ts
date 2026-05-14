import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldCalendarConfigDocument =
  HydratedDocument<WorldCalendarConfigSchemaClass>;

@Schema({ timestamps: true, collection: 'world_calendar_configs' })
export class WorldCalendarConfigSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ default: 24 }) hoursPerDay: number;
  @Prop({ type: [String], default: [] }) daysOfWeek: string[];
  @Prop({ type: [Object], default: [] }) months: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] })
  celestialBodies: Record<string, unknown>[];
  @Prop({ type: Object, default: null })
  referenceDate: Record<string, unknown> | null;
}

export const WorldCalendarConfigSchema = SchemaFactory.createForClass(
  WorldCalendarConfigSchemaClass,
);
WorldCalendarConfigSchema.index({ worldId: 1 }, { unique: true });
