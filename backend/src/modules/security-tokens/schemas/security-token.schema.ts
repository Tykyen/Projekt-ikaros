import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { SecurityTokenType } from '../interfaces/security-token.interface';

export type SecurityTokenDocument = HydratedDocument<SecurityTokenSchemaClass>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'security_tokens',
})
export class SecurityTokenSchemaClass {
  @Prop({ required: true, unique: true, index: true }) tokenHash: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, type: String }) type: SecurityTokenType;
  @Prop({ type: Object }) meta?: Record<string, unknown>;
  @Prop({ required: true, type: Date }) expiresAt: Date;
  @Prop({ type: Date }) usedAt?: Date;
}

export const SecurityTokenSchema = SchemaFactory.createForClass(
  SecurityTokenSchemaClass,
);

// TTL index — MongoDB auto-deletuje doc když current > expiresAt.
// Cleanup zachovává auditní stopu po expiry, ale ne věčně.
SecurityTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Compound index pro invalidateAllByUserAndType — vyhledání not-yet-used tokenů.
SecurityTokenSchema.index({ userId: 1, type: 1, usedAt: 1 });
