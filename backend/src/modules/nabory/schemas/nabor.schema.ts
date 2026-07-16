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
  // 19.3b — canonical id (`drdplus`), ne „dlouhé" world id ani volný text.
  @Prop() system?: string;
  // 19.3b — label z nabídky žánrů (parita `world.genre`).
  @Prop() genre?: string;
  @Prop({ required: true }) mode: string;
  @Prop() place?: string;
  @Prop() seatsTotal?: number;
  @Prop({ default: 0 }) seatsTaken: number;
  @Prop({ default: 'open' }) status: string;
  // D-SEC-GAP-2026-07-11 — index pro creation-cap countActiveByAuthor.
  @Prop({ required: true, index: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  // Post-moderace: userId nahlašovatelů (idempotentní, reportCount = length).
  @Prop({ type: [String], default: [] }) reportedBy: string[];
  // B4b (spec 20B) — moderační skrytí (akce M2/M3). Skrytý nábor se ve veřejné
  // nástěnce i detailu vynechá; vidí ho jen reviewer set. Default false.
  @Prop({ default: false }) moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop() expiresAtUtc?: Date;
}

export const NaborSchema = SchemaFactory.createForClass(NaborSchemaClass);
NaborSchema.index({ status: 1, createdAtUtc: -1 });
