import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { WorldNewsType } from '../interfaces/world-news.interface';

export type WorldNewsDocument = HydratedDocument<WorldNewsSchemaClass>;

@Schema({ collection: 'worldnews', timestamps: false })
export class WorldNewsSchemaClass {
  @Prop({ type: String, default: null }) worldId: string | null;
  @Prop({ required: true, maxlength: 200 }) title: string;
  @Prop({ required: true, maxlength: 10000 }) content: string;
  @Prop({ required: true }) date: string;
  @Prop({
    type: String,
    enum: ['info', 'alert', 'system'],
    default: 'info',
  })
  type: WorldNewsType;
  @Prop() link?: string;
  @Prop() createdBy?: string;
}

export const WorldNewsSchema =
  SchemaFactory.createForClass(WorldNewsSchemaClass);
WorldNewsSchema.index({ worldId: 1, date: -1 });
