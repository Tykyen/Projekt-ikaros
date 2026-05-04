import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosNewsDocument = HydratedDocument<IkarosNewsSchemaClass>;

@Schema({ collection: 'ikaros_news' })
export class IkarosNewsSchemaClass {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) content: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop({ default: true }) isActive: boolean;
}

export const IkarosNewsSchema = SchemaFactory.createForClass(IkarosNewsSchemaClass);
IkarosNewsSchema.index({ createdAtUtc: -1 });
