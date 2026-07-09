import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UploadConsentDocument = HydratedDocument<UploadConsentSchemaClass>;

/**
 * Spec 20D (D3) — kolekce `upload_consents`. Audit doklad souhlasu s právy při
 * uploadu. NEMAŽE se. Enumy jsou uloženy jako string (rozšiřitelné); validaci
 * hodnot řeší volající service, kolekce je jen úložiště důkazu.
 */
@Schema({ collection: 'upload_consents' })
export class UploadConsentSchemaClass {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true, default: 'gallery' }) targetType: string;
  @Prop() targetId?: string;
  @Prop({ required: true, default: 'upload' }) action: string;
  // Vždy true — záznam vzniká jen při uděleném souhlasu (doklad prohlášení práv).
  @Prop({ required: true, default: true }) rightsDeclared: boolean;
  @Prop({ default: false }) aiDeclared: boolean;
  @Prop({ default: '' }) termsVersion: string;
  @Prop() ip?: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
}

export const UploadConsentSchema = SchemaFactory.createForClass(
  UploadConsentSchemaClass,
);
UploadConsentSchema.index({ userId: 1, createdAtUtc: -1 });
UploadConsentSchema.index({ targetType: 1, targetId: 1 });
