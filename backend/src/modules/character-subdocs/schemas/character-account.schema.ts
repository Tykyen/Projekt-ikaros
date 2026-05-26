import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type CharacterAccountDocument =
  HydratedDocument<CharacterAccountSchemaClass>;

/**
 * 8.6 — Finanční účet postavy. Vlastnit ho může 1..N postav (`ownerCharacterIds`).
 * Primary owner se používá jako default „Vedeno u" + pro výchozí UI flow.
 */
@Schema({ timestamps: true, collection: 'character_accounts' })
export class CharacterAccountSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) label: string;
  @Prop({ type: [String], required: true }) ownerCharacterIds: string[];
  @Prop({ required: true }) primaryOwnerId: string;
  @Prop({ default: 'Osobní' }) accountType: string;
  @Prop({ type: Object, default: null })
  accessLocation: { type: 'character'; characterId: string } | null;
  @Prop({ required: true }) currency: string;
  @Prop({ default: 0 }) balance: number;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  incomeEntries: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  expenseEntries: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  transactions: Record<string, unknown>[];
  @Prop({ default: '' }) notes: string;
  /**
   * Spec 8.x-prep §4.3 (B3) — pokud true, hráč-vlastník smí volat `adjust`
   * endpoint (vklad i výběr s povinným důvodem). Default false → jen PJ+.
   */
  @Prop({ default: false }) allowPlayerSelfAdjust: boolean;
}

export const CharacterAccountSchema = SchemaFactory.createForClass(
  CharacterAccountSchemaClass,
);
CharacterAccountSchema.index({ worldId: 1, ownerCharacterIds: 1 });
CharacterAccountSchema.index({ primaryOwnerId: 1 });
