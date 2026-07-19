/**
 * 21.5d — Riddle schema (hádanky, komunitní katalog, kolekce `riddles`).
 * Vzor: plants (community-only, bez statblocků). Identita = `question`.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  RIDDLE_DIFFICULTIES,
  type RiddleDifficulty,
} from '../interfaces/riddle.interface';
import { sortKeyPlugin } from '../../../common/utils/name-sort';

export type RiddleDocument = HydratedDocument<RiddleSchemaClass>;

@Schema({ timestamps: true, collection: 'riddles' })
export class RiddleSchemaClass {
  @Prop({ required: true, enum: ['community'], default: 'community' })
  scope!: 'community';

  /** Zadání hádanky (identita, spec R4). */
  @Prop({ required: true }) question!: string;
  /** D-NAMESORT — řadicí klíč (fold z `question`); derivuje plugin, needituj ručně. */
  @Prop({ index: true }) questionSort?: string;
  /** Odpověď — FE skrývá za spoiler. */
  @Prop({ required: true }) answer!: string;
  /** Postupné nápovědy (0–5, limit vynucuje DTO). */
  @Prop({ type: [String], default: [] }) hints!: string[];

  /** Úroveň obtížnosti — hlavní filtr (spec R2). */
  @Prop({
    type: String,
    required: true,
    enum: RIDDLE_DIFFICULTIES,
    index: true,
  })
  difficulty!: RiddleDifficulty;

  /** Původ („lidová", „antika — Homér", …). */
  @Prop() origin?: string;
  /** Poznámka pro PJ / kontext. */
  @Prop() description?: string;
  @Prop({ type: [String], default: undefined }) tags?: string[];

  @Prop() imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10). */
  @Prop() imageBytes?: number;
  @Prop({ type: Number, default: null }) imageFocalX?: number | null;
  @Prop({ type: Number, default: null }) imageFocalY?: number | null;
  @Prop({ type: Number, default: null }) imageZoom?: number | null;
  @Prop({ type: String, default: null }) imageFit?: 'cover' | 'contain' | null;

  /** Stav: 'draft' = knihovna návrhů, 'approved' = schválená knihovna. */
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

  // Moderační skrytí (parity s bestiae B5). Čtení filtruje `$ne: true`.
  @Prop({ type: Boolean, default: false, index: true })
  moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
}

export const RiddleSchema = SchemaFactory.createForClass(RiddleSchemaClass);
sortKeyPlugin(RiddleSchema, 'question', 'questionSort');
// List dvou knihoven + filtr úrovně.
RiddleSchema.index({ status: 1, difficulty: 1 });
