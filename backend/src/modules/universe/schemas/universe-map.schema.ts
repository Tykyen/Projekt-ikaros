import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UniverseMapDocument = HydratedDocument<UniverseMapSchemaClass>;

@Schema({ timestamps: true, collection: 'universeMaps' })
export class UniverseMapSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ type: [Object], default: [] }) nodes: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) links: Record<string, unknown>[];
}

export const UniverseMapSchema = SchemaFactory.createForClass(UniverseMapSchemaClass);
UniverseMapSchema.index({ worldId: 1 }, { unique: true });
