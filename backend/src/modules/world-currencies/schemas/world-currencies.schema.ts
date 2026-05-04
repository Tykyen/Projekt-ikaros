import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldCurrenciesDocument = HydratedDocument<WorldCurrenciesSchemaClass>;

@Schema({ collection: 'world_currencies' })
export class WorldCurrenciesSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ type: [Object], default: [] }) items: Record<string, unknown>[];
  @Prop({ default: Date.now }) updatedAt: Date;
}

export const WorldCurrenciesSchema = SchemaFactory.createForClass(WorldCurrenciesSchemaClass);
