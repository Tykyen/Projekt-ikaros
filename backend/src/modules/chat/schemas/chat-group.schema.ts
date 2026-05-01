import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatGroupDocument = HydratedDocument<ChatGroupSchemaClass>;

@Schema({ timestamps: true, collection: 'chatgroups' })
export class ChatGroupSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: 0 }) order: number;
}

export const ChatGroupSchema = SchemaFactory.createForClass(ChatGroupSchemaClass);
ChatGroupSchema.index({ worldId: 1, order: 1 });
