import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FriendBlockDocument = HydratedDocument<FriendBlockSchemaClass>;

@Schema({
  timestamps: { createdAt: 'blockedAt', updatedAt: false },
  collection: 'friend_blocks',
})
export class FriendBlockSchemaClass {
  @Prop({ required: true, index: true }) blockerId: string;
  @Prop({ required: true, index: true }) blockedId: string;
}

export const FriendBlockSchema = SchemaFactory.createForClass(
  FriendBlockSchemaClass,
);

FriendBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
