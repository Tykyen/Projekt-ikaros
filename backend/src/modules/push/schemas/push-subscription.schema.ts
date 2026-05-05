import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PushSubscriptionDocument = HydratedDocument<PushSubscriptionSchemaClass>;

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscriptionSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, unique: true }) endpoint: string;
  @Prop({ required: true }) p256dh: string;
  @Prop({ required: true }) auth: string;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscriptionSchemaClass);
