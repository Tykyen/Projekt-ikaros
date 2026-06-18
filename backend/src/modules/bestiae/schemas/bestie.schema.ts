/**
 * 10.2d-prep-B — Bestie schema (statblok šablona, žádný deník).
 *
 * 3-scope kolekce: 'system' (admin-managed seeds), 'user' (per PJ napříč
 * jeho světy), 'world' (per-svět specifika). `systemStats` storage validátor
 * z 10.2d-prep-A (SystemStatsValidatorService).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BestieDocument = HydratedDocument<BestieSchemaClass>;

@Schema({ timestamps: true, collection: 'bestiae' })
export class BestieSchemaClass {
  @Prop({ required: true, enum: ['system', 'user', 'world'], index: true })
  scope!: 'system' | 'user' | 'world';

  @Prop({ required: true, index: true }) systemId!: string;

  @Prop({ index: true, sparse: true }) ownerUserId?: string;
  @Prop({ index: true, sparse: true }) worldId?: string;

  @Prop({ required: true }) name!: string;
  @Prop() imageUrl?: string;
  // Výřez obrázku (parity s GameEvent/WorldNews). null = default (focal 50/50).
  @Prop({ type: Number, default: null }) imageFocalX?: number | null;
  @Prop({ type: Number, default: null }) imageFocalY?: number | null;
  @Prop({ type: Number, default: null }) imageZoom?: number | null;
  @Prop({ type: String, default: null }) imageFit?: 'cover' | 'contain' | null;
  @Prop({ default: '' }) notes!: string;

  @Prop({ type: [Object], default: [] })
  abilities!: Array<{ label: string; value: string }>;

  @Prop({ type: Object, default: {} })
  systemStats!: Record<string, unknown>;

  @Prop() clonedFromId?: string;

  @Prop({ type: Date, default: null }) deletedAt!: Date | null;
}

export const BestieSchema = SchemaFactory.createForClass(BestieSchemaClass);
BestieSchema.index({ scope: 1, systemId: 1 });
BestieSchema.index({ scope: 1, ownerUserId: 1, systemId: 1 });
BestieSchema.index({ scope: 1, worldId: 1, systemId: 1 });
