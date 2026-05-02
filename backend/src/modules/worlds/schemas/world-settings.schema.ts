import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldSettingsDocument = HydratedDocument<WorldSettingsSchemaClass>;

@Schema({ collection: 'worldsettings' })
export class WorldSettingsSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ type: [String], default: [] }) hiddenNavItems: string[];
  @Prop({ type: [String], default: [] }) customGroups: string[];
  @Prop({ type: Object, default: {} }) groupColors: Record<string, string>;
  @Prop({ type: [Object], default: [] }) customHeadline: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) currencies: Record<string, unknown>[];
  @Prop({ default: false }) hideDefaultWeather: boolean;
  @Prop({ type: [Object], default: [] }) akjTypes: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) menuTemplates: Record<string, unknown>[];
  @Prop({ default: Date.now }) updatedAt: Date;
}

export const WorldSettingsSchema = SchemaFactory.createForClass(WorldSettingsSchemaClass);
