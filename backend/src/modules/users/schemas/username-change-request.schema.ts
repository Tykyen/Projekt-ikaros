import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { UsernameChangeStatus } from '../interfaces/username-change-request.interface';

export type UsernameChangeRequestDocument =
  HydratedDocument<UsernameChangeRequestSchemaClass>;

@Schema({
  timestamps: { createdAt: 'requestedAt', updatedAt: false },
  collection: 'username_change_requests',
})
export class UsernameChangeRequestSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) username: string;
  @Prop({ required: true }) requestedUsername: string;
  @Prop({ required: true, type: String, default: 'pending' })
  status: UsernameChangeStatus;
  @Prop() decidedBy?: string;
  @Prop({ type: Date }) decidedAt?: Date;
  @Prop() decisionReason?: string;
  // D-028 — kdy žadatel viděl rozhodnutí (toast po loginu). chybí = nezhlédnuto.
  @Prop({ type: Date }) seenAt?: Date;
}

export const UsernameChangeRequestSchema = SchemaFactory.createForClass(
  UsernameChangeRequestSchemaClass,
);
// Partial index — jen pending requesty (rychly lookup pri findPendingByUserId).
UsernameChangeRequestSchema.index(
  { userId: 1, status: 1 },
  { partialFilterExpression: { status: 'pending' } },
);
