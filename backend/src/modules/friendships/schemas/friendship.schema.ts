import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { FriendshipStatus } from '../interfaces/friendship.interface';

export type FriendshipDocument = HydratedDocument<FriendshipSchemaClass>;

@Schema({
  timestamps: { createdAt: 'requestedAt', updatedAt: false },
  collection: 'friendships',
})
export class FriendshipSchemaClass {
  @Prop({ required: true, index: true }) requesterId: string;
  @Prop({ required: true, index: true }) recipientId: string;
  @Prop({ required: true, type: String, default: 'pending' })
  status: FriendshipStatus;
  @Prop({ type: Date }) acceptedAt?: Date;
  @Prop({ type: Date, index: true }) rejectedAt?: Date;
}

export const FriendshipSchema = SchemaFactory.createForClass(
  FriendshipSchemaClass,
);

// Compound index pro recipient incoming lookup
FriendshipSchema.index({ recipientId: 1, status: 1 });
// Compound index pro requester+recipient lookup
FriendshipSchema.index({ requesterId: 1, recipientId: 1, status: 1 });
