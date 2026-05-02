import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../interfaces/user.interface';

export type UserDocument = HydratedDocument<UserSchemaClass>;

@Schema({ timestamps: true, collection: 'users' })
export class UserSchemaClass {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: Number, enum: UserRole, default: UserRole.Hrac })
  role: UserRole;

  @Prop() displayName?: string;
  @Prop() avatarUrl?: string;
  @Prop() characterPath?: string;
  @Prop() ikarosSkin?: string;

  @Prop({ default: false }) akj: boolean;
  @Prop({ type: Object, default: {} }) themeSettings: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) chatPreferences: Record<string, unknown>;

  @Prop({ default: false }) isOnline: boolean;
  @Prop({ default: Date.now }) lastSeenAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserSchemaClass);
UserSchema.index({ role: 1 });
