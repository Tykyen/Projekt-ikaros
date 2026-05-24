import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type CharacterFinanceDocument =
  HydratedDocument<CharacterFinanceSchemaClass>;

// D-073 (2026-05-23) — timestamps pro optimistic concurrency.
@Schema({ timestamps: true, collection: 'character_finances' })
export class CharacterFinanceSchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({ default: 'Osobní' }) accountType: string;
  @Prop({ default: '' }) accessLocation: string;
  @Prop({ default: '' }) currency: string;
  @Prop() lastSyncDate?: Date;
  @Prop({ default: 0 }) balance: number;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  entries: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  transactions: Record<string, unknown>[];
  // 8.1-FIR (2026-05-24) — RichText sekce „Rozepsané" (Matrix-style).
  @Prop({ default: '' }) notes: string;
}

export const CharacterFinanceSchema = SchemaFactory.createForClass(
  CharacterFinanceSchemaClass,
);
CharacterFinanceSchema.index({ characterId: 1 }, { unique: true });
