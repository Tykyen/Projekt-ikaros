import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GameEventDocument = HydratedDocument<GameEventSchemaClass>;

@Schema({ timestamps: true, collection: 'game_events' })
export class GameEventSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true, index: true }) date: string;
  @Prop() description?: string;
  @Prop({ default: false }) reminderSent: boolean;
}

export const GameEventSchema = SchemaFactory.createForClass(GameEventSchemaClass);
GameEventSchema.index({ date: 1 });
