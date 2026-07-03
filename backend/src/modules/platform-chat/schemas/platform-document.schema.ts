import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** 20.5 — sdílené PDF admin chatu. `timestamps` → createdAt/updatedAt. */
@Schema({ collection: 'platform_documents', timestamps: true })
export class PlatformDocumentSchemaClass {
  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  publicId: string;

  @Prop({ default: 'application/pdf' })
  mimeType: string;

  @Prop({ default: 0 })
  sizeBytes: number;

  @Prop({ required: true, index: true })
  uploaderId: string;

  @Prop({ required: true })
  uploaderName: string;
}

export type PlatformDocumentDocument =
  HydratedDocument<PlatformDocumentSchemaClass>;

export const PlatformDocumentSchema = SchemaFactory.createForClass(
  PlatformDocumentSchemaClass,
);
