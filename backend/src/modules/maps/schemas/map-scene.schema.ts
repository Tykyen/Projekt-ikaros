import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MapSceneDocument = HydratedDocument<MapSceneSchemaClass>;

@Schema({ timestamps: false, collection: 'mapScenes' })
export class MapSceneSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ default: '' }) name: string;
  @Prop({ default: '' }) imageUrl: string;
  @Prop() folder?: string;
  @Prop({
    type: Object,
    default: { size: 40, originX: 0, originY: 0, showGrid: true },
  })
  config: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) tokens: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) npcTemplates: Record<
    string,
    unknown
  >[];
  @Prop({ type: [Object], default: [] }) effects: Record<string, unknown>[];
  @Prop({ default: false }) fogEnabled: boolean;
  @Prop({ type: [Object], default: [] }) revealedHexes: Record<
    string,
    unknown
  >[];
  @Prop() templateId?: string;
  @Prop({ default: false }) isActive: boolean;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({ default: false }) isLocked: boolean;
  @Prop({ type: [String], default: [] }) activeSoundIds: string[];
  @Prop() lastModified?: Date;
}

export const MapSceneSchema = SchemaFactory.createForClass(MapSceneSchemaClass);
MapSceneSchema.index({ worldId: 1 });
MapSceneSchema.index({ worldId: 1, isActive: 1 });
