import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NaborDocument = HydratedDocument<NaborSchemaClass>;

/** 19.3 — kolekce `nabory`. */
@Schema({ collection: 'nabory' })
export class NaborSchemaClass {
  @Prop({ required: true }) strana: string;
  @Prop({ required: true }) motiv: string;
  @Prop() worldId?: string;
  @Prop() worldSlug?: string;
  @Prop() worldName?: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) body: string;
  @Prop() imageUrl?: string;
  @Prop() system?: string;
  @Prop({ required: true }) mode: string;
  @Prop() place?: string;
  @Prop() seatsTotal?: number;
  @Prop({ default: 0 }) seatsTaken: number;
  @Prop({ default: 'open' }) status: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  // Post-moderace: userId nahlašovatelů (idempotentní, reportCount = length).
  @Prop({ type: [String], default: [] }) reportedBy: string[];
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop() expiresAtUtc?: Date;
}

export const NaborSchema = SchemaFactory.createForClass(NaborSchemaClass);
NaborSchema.index({ status: 1, createdAtUtc: -1 });
