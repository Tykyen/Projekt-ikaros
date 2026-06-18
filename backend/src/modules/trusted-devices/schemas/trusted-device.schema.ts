import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TrustedDeviceDocument = HydratedDocument<TrustedDeviceSchemaClass>;

/**
 * 14.1 — důvěryhodné zařízení (remember-device). Po úspěšném 2FA si uživatel
 * může zařízení „zapamatovat" → příští login na témž prohlížeči přeskočí 2FA.
 * V DB jen SHA256 hash tokenu (plaintext žije v httpOnly cookie `ikaros_td`).
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'trusted_devices',
})
export class TrustedDeviceSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, unique: true, index: true }) tokenHash: string;
  @Prop({ required: true }) label: string; // "Chrome · Windows"
  @Prop({ type: Date, default: () => new Date() }) lastUsedAt: Date;
  @Prop({ required: true, type: Date }) expiresAt: Date;
}

export const TrustedDeviceSchema = SchemaFactory.createForClass(
  TrustedDeviceSchemaClass,
);

// TTL index — MongoDB auto-deletuje záznam po expiraci (30 d).
TrustedDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
