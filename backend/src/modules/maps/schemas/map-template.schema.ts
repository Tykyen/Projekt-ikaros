import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MapTemplateDocument = HydratedDocument<MapTemplateSchemaClass>;

@Schema({ timestamps: false, collection: 'mapTemplates' })
export class MapTemplateSchemaClass {
  @Prop({ default: '' }) name: string;
  @Prop({ default: '' }) imageUrl: string;
  @Prop({ type: Object, default: { size: 40, originX: 0, originY: 0, showGrid: true } }) config: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) npcTemplates: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) tokens: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) effects: Record<string, unknown>[];
  @Prop({ default: false }) fogEnabled: boolean;
  @Prop({ type: [Object], default: [] }) revealedHexes: Record<string, unknown>[];
  @Prop({ type: [String], default: [] }) activeSoundIds: string[];
  @Prop() lastModified?: Date;
}

export const MapTemplateSchema = SchemaFactory.createForClass(MapTemplateSchemaClass);
