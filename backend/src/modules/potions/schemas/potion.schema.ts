/**
 * 21.5b — Potion schema (lektvary, komunitní katalog, kolekce `potions`).
 *
 * Jen komunitní scope (vzor spells/plants) + jádro navíc: druh (`kind`),
 * strukturované suroviny (`ingredients`, min. 1 — vynucuje DTO) a navrhovaná
 * cena. `statblocks` per systém schema-less — šablony vynucuje FE (spec R5).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  PotionIngredient,
  PotionStatblockEntry,
} from '../interfaces/potion.interface';
import { sortKeyPlugin } from '../../../common/utils/name-sort';

export type PotionDocument = HydratedDocument<PotionSchemaClass>;

@Schema({ timestamps: true, collection: 'potions' })
export class PotionSchemaClass {
  @Prop({ required: true, enum: ['community'], default: 'community' })
  scope!: 'community';

  /** Primární systém (lektvar vznikl pro něj) — filtr knihovny. */
  @Prop({ required: true, index: true }) systemId!: string;

  @Prop({ required: true }) name!: string;
  /** D-NAMESORT — řadicí klíč (fold z `name`); derivuje plugin, needituj ručně. */
  @Prop({ index: true }) nameSort?: string;
  /** Alternativní/lidová jména (volný text). */
  @Prop() aliases?: string;

  @Prop() imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10). */
  @Prop() imageBytes?: number;
  @Prop({ type: Number, default: null }) imageFocalX?: number | null;
  @Prop({ type: Number, default: null }) imageFocalY?: number | null;
  @Prop({ type: Number, default: null }) imageZoom?: number | null;
  @Prop({ type: String, default: null }) imageFit?: 'cover' | 'contain' | null;

  /** Druh lektvaru (léčivý/jed/…) — systémově neutrální filtr (spec R2). */
  @Prop({ required: true, index: true }) kind!: string;

  /** Suroviny s množstvím (spec R3). Min. 1 vynucuje DTO. */
  @Prop({
    type: [
      { name: { type: String, required: true }, amount: String, _id: false },
    ],
    default: [],
  })
  ingredients!: PotionIngredient[];

  /** „Oznámení" — popis účinku / lore. */
  @Prop({ default: '' }) description!: string;
  @Prop({ type: [String], default: undefined }) tags?: string[];

  /** Navrhovaná cena (bez měny) — předvyplní vklad do obchodu. */
  @Prop({ type: Number, default: null }) suggestedPrice?: number | null;

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

  /** Mapa systém→statblok (staty + stav + autor) — schvalovací tok jako 21.5c. */
  @Prop({ type: Object, default: {} })
  statblocks!: Record<string, PotionStatblockEntry>;
}

export const PotionSchema = SchemaFactory.createForClass(PotionSchemaClass);
sortKeyPlugin(PotionSchema, 'name', 'nameSort');
// List dvou knihoven + filtr druhu / primárního systému.
PotionSchema.index({ status: 1, kind: 1 });
PotionSchema.index({ status: 1, systemId: 1 });
