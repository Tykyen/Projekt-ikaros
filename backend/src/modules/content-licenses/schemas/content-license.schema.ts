import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContentLicenseDocument =
  HydratedDocument<ContentLicenseSchemaClass>;

/**
 * Spec 20D (D4) — kolekce `content_licenses`. Podklad licenční karty; jedna
 * verze = jeden dokument. Verzování je append-only (změna režimu = nový
 * dokument s vyšším `versionId`), historie se NEPŘEPISUJE.
 *
 * Enumy jsou uloženy jako string (rozšiřitelné právním rámcem / Fází 18);
 * validaci hodnot řeší doménová vrstva, ne schema, aby podklad zůstal volný.
 */
@Schema({ collection: 'content_licenses' })
export class ContentLicenseSchemaClass {
  @Prop({ required: true }) contentId: string;
  @Prop({ required: true, default: '1' }) versionId: string;
  @Prop({ required: true }) ownerUserId: string;
  @Prop({ default: '' }) publicAuthorName: string;
  @Prop({ required: true, default: 'private' }) licenseMode: string;
  @Prop({ default: false }) cloneAllowed: boolean;
  @Prop({ default: false }) derivativesAllowed: boolean;
  @Prop({ default: false }) exportAllowed: boolean;
  @Prop({ required: true, default: 'A6' }) aiOrigin: string;
  @Prop({ required: true, default: 'unknown' }) thirdPartyStatus: string;
  @Prop() rpgSystemId?: string;
  @Prop({ default: false }) attributionRequired: boolean;
  @Prop() sourceUrlOrNote?: string;
  @Prop({ required: true, default: 'pending' }) reviewStatus: string;
  @Prop({ default: '' }) acceptedTermsVersion: string;
  @Prop() parentContentId?: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
}

export const ContentLicenseSchema = SchemaFactory.createForClass(
  ContentLicenseSchemaClass,
);
// Jednoznačnost verze v rámci obsahu + rychlé „nejnovější verze".
ContentLicenseSchema.index({ contentId: 1, versionId: 1 }, { unique: true });
ContentLicenseSchema.index({ contentId: 1, createdAtUtc: -1 });
