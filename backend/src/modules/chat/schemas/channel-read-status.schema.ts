import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChannelReadStatusDocument = HydratedDocument<ChannelReadStatusSchemaClass>;

@Schema({ collection: 'channelreadstatus' })
export class ChannelReadStatusSchemaClass {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) channelId: string;
  @Prop({ type: String, default: null }) lastReadMessageId: string | null;
  @Prop({ required: true }) lastReadAt: Date;
}

export const ChannelReadStatusSchema = SchemaFactory.createForClass(ChannelReadStatusSchemaClass);
ChannelReadStatusSchema.index({ userId: 1, channelId: 1 }, { unique: true });
