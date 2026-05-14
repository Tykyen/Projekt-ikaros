import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { WorldRole } from '../interfaces/world-membership.interface';

export type WorldMembershipDocument =
  HydratedDocument<WorldMembershipSchemaClass>;

@Schema({ timestamps: false, collection: 'worldmemberships' })
export class WorldMembershipSchemaClass {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ type: Number, enum: WorldRole, default: WorldRole.Hrac })
  role: WorldRole;
  @Prop({ default: Date.now }) joinedAt: Date;
  @Prop() avatarUrl?: string;
  @Prop() characterPath?: string;
  @Prop() group?: string;
  @Prop({ default: false }) isFree: boolean;
  @Prop({ default: 0 }) akj: number;
}

export const WorldMembershipSchema = SchemaFactory.createForClass(
  WorldMembershipSchemaClass,
);
WorldMembershipSchema.index({ userId: 1, worldId: 1 }, { unique: true });
WorldMembershipSchema.index({ worldId: 1 });
