import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshTokenSchemaClass>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'refresh_tokens',
})
export class RefreshTokenSchemaClass {
  @Prop({ required: true, unique: true }) jti: string;
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) familyId: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop({ default: false }) revoked: boolean;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(
  RefreshTokenSchemaClass,
);
RefreshTokenSchema.index({ userId: 1 });
RefreshTokenSchema.index({ familyId: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
