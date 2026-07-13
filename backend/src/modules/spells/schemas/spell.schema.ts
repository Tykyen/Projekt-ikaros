/**
 * 21.5c — Spell schema (kouzla, komunitní katalog, kolekce `spells`).
 *
 * Jen globální komunitní scope (vzor plants) + mapa `statblocks` per systém
 * (vzor bestie community). `systemStats` uvnitř statbloků je schema-less —
 * šablony polí per systém vynucuje FE formulář (spec-21.5c R6).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SpellStatblockEntry } from '../interfaces/spell.interface';

export type SpellDocument = HydratedDocument<SpellSchemaClass>;

@Schema({ timestamps: true, collection: 'spells' })
export class SpellSchemaClass {
  // Kouzla mají jen komunitní scope; enum ['community'] pro konzistenci + budoucnost.
  @Prop({ required: true, enum: ['community'], default: 'community' })
  scope!: 'community';

  /** Primární systém (kouzlo vzniklo pro něj) — filtr knihovny. */
  @Prop({ required: true, index: true }) systemId!: string;

  @Prop({ required: true }) name!: string;
  /** Alternativní/lidová jména (volný text). */
  @Prop() aliases?: string;

  @Prop() imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10); staré docs nemají. */
  @Prop() imageBytes?: number;
  // Výřez obrázku (parity s Bestie/Plant). null = default (50/50).
  @Prop({ type: Number, default: null }) imageFocalX?: number | null;
  @Prop({ type: Number, default: null }) imageFocalY?: number | null;
  @Prop({ type: Number, default: null }) imageZoom?: number | null;
  @Prop({ type: String, default: null }) imageFit?: 'cover' | 'contain' | null;

  /** „Oznámení" — lore/popis účinku kouzla. */
  @Prop({ default: '' }) description!: string;
  @Prop({ type: [String], default: undefined }) tags?: string[];

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

  /**
   * Mapa systém→statblok (staty + stav + autor). Hráč mění jen schvalovacím
   * tokem (návrh → kurátor schválí = balancnuté); kurátor edituje přímo.
   */
  @Prop({ type: Object, default: {} })
  statblocks!: Record<string, SpellStatblockEntry>;
}

export const SpellSchema = SchemaFactory.createForClass(SpellSchemaClass);
// List dvou knihoven (schválené / návrhy) + filtr primárního systému.
SpellSchema.index({ status: 1, systemId: 1 });
