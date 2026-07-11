/**
 * 21.5a — Plant schema (herbář, komunitní katalog rostlin, kolekce `plants`).
 *
 * Jen globální komunitní scope — žádné system/user/world, žádné boj/spawn/svět.
 * `statblocks` je prázdná mapa připravená na budoucí per-systém staty (zatím
 * se needituje). Vzor: bestie.schema.ts (community část), silně zjednodušeno.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  PLANT_RARITIES,
  type PlantRarity,
} from '../interfaces/plant.interface';

export type PlantDocument = HydratedDocument<PlantSchemaClass>;

@Schema({ timestamps: true, collection: 'plants' })
export class PlantSchemaClass {
  // Herbář má jen komunitní scope; enum ['community'] pro konzistenci + budoucnost.
  @Prop({ required: true, enum: ['community'], default: 'community' })
  scope!: 'community';

  @Prop({ required: true }) name!: string;
  /** Lidová/regionální jména (volný text). */
  @Prop() aliases?: string;

  @Prop() imageUrl?: string;
  // Výřez obrázku (parity s Bestie/GameEvent/WorldNews). null = default (50/50).
  @Prop({ type: Number, default: null }) imageFocalX?: number | null;
  @Prop({ type: Number, default: null }) imageFocalY?: number | null;
  @Prop({ type: Number, default: null }) imageZoom?: number | null;
  @Prop({ type: String, default: null }) imageFit?: 'cover' | 'contain' | null;

  /** „Roste" — kde rostlina roste (volný text). */
  @Prop() habitat?: string;
  /** „Použití" — k čemu je (volný text). */
  @Prop() usage?: string;

  /** Vzácnost — 5 stupňů (filtr knihovny). */
  @Prop({ type: String, enum: PLANT_RARITIES, index: true, sparse: true })
  rarity?: PlantRarity;
  /** Volný dovětek k vzácnosti. */
  @Prop() rarityNote?: string;

  @Prop({ default: '' }) description!: string;
  @Prop({ type: [String], default: undefined }) tags?: string[];

  /** Navrhovaná cena (bez měny). null = neuvedeno. */
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

  /** Atribuce autora (povinná). */
  @Prop({ required: true, index: true }) authorId!: string;
  @Prop({ type: Date, default: null }) approvedAt?: Date | null;
  @Prop() approvedBy?: string;

  // Moderační skrytí (parity s bestiae B5). Čtení filtruje `$ne: true`.
  @Prop({ type: Boolean, default: false, index: true })
  moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;

  /** Prázdná mapa systém→staty; připraveno na budoucí per-systém staty. */
  @Prop({ type: Object, default: {} })
  statblocks!: Record<string, unknown>;
}

export const PlantSchema = SchemaFactory.createForClass(PlantSchemaClass);
// List dvou knihoven (schválené / návrhy) + filtr vzácnosti.
PlantSchema.index({ status: 1, rarity: 1 });
