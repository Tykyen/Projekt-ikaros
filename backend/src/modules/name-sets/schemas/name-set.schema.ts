/**
 * 21.2a — NameSet schema (jmenné sady, kolekce `name_sets`).
 * Jen komunitní scope; bez obrázků. Vzor: plant.schema.ts.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  FEMALE_SURNAME_RULES,
  NAME_SET_CATEGORIES,
  type FemaleSurnameRule,
  type NameSetCategory,
  type NameSetDemography,
} from '../interfaces/name-set.interface';

export type NameSetDocument = HydratedDocument<NameSetSchemaClass>;

@Schema({ timestamps: true, collection: 'name_sets' })
export class NameSetSchemaClass {
  @Prop({ required: true, enum: ['community'], default: 'community' })
  scope!: 'community';

  @Prop({ required: true }) name!: string;

  @Prop({
    type: String,
    required: true,
    enum: NAME_SET_CATEGORIES,
    index: true,
  })
  category!: NameSetCategory;

  @Prop() description?: string;
  /** Poznámka k příjmením („nemá příjmení", „podle rodiče"). */
  @Prop() surnameNote?: string;
  @Prop({ type: [String], default: undefined }) tags?: string[];

  @Prop({ type: [String], default: [] }) maleNames!: string[];
  @Prop({ type: [String], default: [] }) femaleNames!: string[];
  @Prop({ type: [String], default: [] }) surnames!: string[];
  /** V7 — přízviska. */
  @Prop({ type: [String], default: [] }) epithets!: string[];

  /** V1 — přechylování ženských příjmení (aplikuje FE za běhu). */
  @Prop({ type: String, enum: FEMALE_SURNAME_RULES, default: 'none' })
  femaleSurnameRule!: FemaleSurnameRule;

  /** V2 — seznamy seřazené dle četnosti → FE smí nabídnout Zipfovo vážení. */
  @Prop({ type: Boolean, default: false })
  frequencySorted!: boolean;

  /** V6 — volitelný demografický profil rasy. */
  @Prop({ type: Object, default: undefined })
  demography?: NameSetDemography;

  @Prop({
    type: String,
    required: true,
    enum: ['draft', 'approved'],
    default: 'draft',
    index: true,
  })
  status!: 'draft' | 'approved';

  @Prop({ required: true, index: true }) authorId!: string;
  @Prop({ type: Date, default: null }) approvedAt?: Date | null;
  @Prop() approvedBy?: string;

  @Prop({ type: Boolean, default: false, index: true })
  moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
}

export const NameSetSchema = SchemaFactory.createForClass(NameSetSchemaClass);
// List dvou knihoven + filtr kategorie, abecedně.
NameSetSchema.index({ status: 1, category: 1, name: 1 });
