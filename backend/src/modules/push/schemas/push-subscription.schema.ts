import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PushSubscriptionDocument =
  HydratedDocument<PushSubscriptionSchemaClass>;

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscriptionSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, unique: true }) endpoint: string;
  @Prop({ required: true }) p256dh: string;
  @Prop({ required: true }) auth: string;
  /** D-030 — user-agent prohlížeče při (re)subscribe; rozlišení zařízení v UI. */
  @Prop() userAgent?: string;
  /** D-030 — poslední (re)subscribe; default = čas vzniku. */
  @Prop({ type: Date, default: Date.now }) lastUsedAt: Date;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(
  PushSubscriptionSchemaClass,
);
