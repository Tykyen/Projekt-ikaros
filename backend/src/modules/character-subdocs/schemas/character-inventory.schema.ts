import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type CharacterInventoryDocument =
  HydratedDocument<CharacterInventorySchemaClass>;

// D-073 (2026-05-23) — timestamps pro optimistic concurrency.
@Schema({ timestamps: true, collection: 'character_inventories' })
export class CharacterInventorySchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  sections: Record<string, unknown>[];
  // 8.1-FIR (2026-05-24) — RichText sekce „Rozepsané" (Matrix-style).
  @Prop({ default: '' }) notes: string;
}

export const CharacterInventorySchema = SchemaFactory.createForClass(
  CharacterInventorySchemaClass,
);
CharacterInventorySchema.index({ characterId: 1 }, { unique: true });
