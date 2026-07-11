import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../../users/interfaces/user.interface';

export type ScheduledMessageDocument =
  HydratedDocument<ScheduledMessageSchemaClass>;

/**
 * 11.2-ext F — naplánované zprávy. Index `{ status, sendAt }` pro cron
 * `findDue`, `{ ownerId, worldId, status }` pro frontu v UI.
 */
@Schema({ timestamps: true, collection: 'scheduledMessages' })
export class ScheduledMessageSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) channelId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ required: true }) ownerName: string;
  @Prop({ required: true, type: Number, default: UserRole.PJ })
  ownerRole: UserRole;
  @Prop() content?: string;
  @Prop({ type: [Object], default: [] }) attachments: Record<string, unknown>[];
  @Prop({ required: true }) sendAt: Date;
  @Prop({
    type: String,
    required: true,
    default: 'pending',
    enum: ['pending', 'sent', 'failed'],
    index: true,
  })
  status: 'pending' | 'sent' | 'failed';
}

export const ScheduledMessageSchema = SchemaFactory.createForClass(
  ScheduledMessageSchemaClass,
);

ScheduledMessageSchema.index({ status: 1, sendAt: 1 });
ScheduledMessageSchema.index({ ownerId: 1, worldId: 1, status: 1 });
