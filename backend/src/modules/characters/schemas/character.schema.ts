import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type CharacterDocument = HydratedDocument<CharacterSchemaClass>;

/**
 * Krok 9.1 (cleanup) — Schema obsahuje JEN pole subdoc kontejneru. Bio
 * data se po sjednocení Character → Page držela duplicitně; cleanup
 * skript je smazal. Pages mají bio kanonicky.
 *
 * Permission pole (userId, isNpc) zůstávají — `assertSubdocAccess`
 * v CharactersService je používá pro owner/PJ rozlišení v subdoc API.
 */
@Schema({ timestamps: true, collection: 'characters' })
export class CharacterSchemaClass {
  @Prop({ required: true }) slug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) worldId: string;
  @Prop() userId?: string;
  @Prop({ default: false }) isNpc: boolean;
  /**
   * Spec 9.2 — typ entity, kterou Character "obaluje":
   *  - `'persona'` (default) → PostavaHrace / NPC. Plné subdocs (diary/calendar/
   *    finance/inventory/notes).
   *  - `'location'` → Lokace (Page typu `Lokace` s characterRef). Jen calendar
   *    subdoc; `isNpc` se pro location ignoruje (nepostava).
   */
  @Prop({ type: String, enum: ['persona', 'location'], default: 'persona' })
  kind: 'persona' | 'location';
  @Prop({ type: Object, default: {} }) diaryData: Record<string, unknown>;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  extraBlocks: Record<string, unknown>[];
  @Prop() campaignSubjectId?: string;
  @Prop({ type: Object, default: {} }) customData?: Record<string, unknown>;
  /** 9.2c — preferovaný kalendář pro events postavy; null → fallback world default. */
  @Prop({ type: String, default: null })
  preferredCalendarConfigId: string | null;
}

export const CharacterSchema =
  SchemaFactory.createForClass(CharacterSchemaClass);
CharacterSchema.index({ worldId: 1, slug: 1 }, { unique: true });
CharacterSchema.index({ worldId: 1, userId: 1 });
