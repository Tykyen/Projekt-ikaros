/**
 * 21.5f — PriceList schema (ceníky, komunitní knihovna, kolekce `price_lists`).
 *
 * Ceník = jeden dokument s vnořenými položkami (`items[]`, max 200 — vynucuje
 * DTO + service, ne schema). Jen globální komunitní scope. Vzor:
 * plant.schema.ts + vnořený subdokument bez vlastního `_id` (id = uuid pole).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PriceListDocument = HydratedDocument<PriceListSchemaClass>;

/** Položka ceníku — vnořený subdokument (pořadí = pořadí v poli). */
@Schema({ _id: false })
export class PriceListItemSchemaClass {
  /** UUID položky (generuje service, když ho DTO nenese). */
  @Prop({ required: true }) id!: string;

  @Prop({ required: true }) name!: string;
  @Prop() description?: string;
  /** Sekce uvnitř ceníku („V hospodě", region…) — FE seskupuje. */
  @Prop() section?: string;

  @Prop() imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10). */
  @Prop() imageBytes?: number;
  @Prop({ type: Number, default: null }) imageFocalX?: number | null;
  @Prop({ type: Number, default: null }) imageFocalY?: number | null;
  @Prop({ type: Number, default: null }) imageZoom?: number | null;
  @Prop({ type: String, default: null }) imageFit?: 'cover' | 'contain' | null;
  /** R6 — atribuce převzatého obrázku (autor · zdroj · licence). */
  @Prop() imageCredit?: string;

  /** Cena: zlaté / stříbrné / měďáky (celá čísla ≥ 0, pevný poměr 1:10:100). */
  @Prop({ required: true, default: 0 }) gold!: number;
  @Prop({ required: true, default: 0 }) silver!: number;
  @Prop({ required: true, default: 0 }) copper!: number;

  /** R4 — link na komunitní předmět (`community_items`) se staty per systém. */
  @Prop() linkedItemId?: string;
}

const PriceListItemSchema = SchemaFactory.createForClass(
  PriceListItemSchemaClass,
);

@Schema({ timestamps: true, collection: 'price_lists' })
export class PriceListSchemaClass {
  // Ceníky mají jen komunitní scope; enum ['community'] pro konzistenci rodiny.
  @Prop({ required: true, enum: ['community'], default: 'community' })
  scope!: 'community';

  @Prop({ required: true }) name!: string;
  @Prop({ default: '' }) description!: string;

  @Prop() imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10). */
  @Prop() imageBytes?: number;
  @Prop({ type: Number, default: null }) imageFocalX?: number | null;
  @Prop({ type: Number, default: null }) imageFocalY?: number | null;
  @Prop({ type: Number, default: null }) imageZoom?: number | null;
  @Prop({ type: String, default: null }) imageFit?: 'cover' | 'contain' | null;

  @Prop({ type: [String], default: undefined }) tags?: string[];

  /** 21.5g — měna zobrazení cen; uložení je vždy gold/silver/copper (1:10:100). */
  @Prop({
    type: String,
    enum: ['gsc', 'usd', 'credits'],
    default: 'gsc',
  })
  currency!: 'gsc' | 'usd' | 'credits';

  @Prop({ type: [PriceListItemSchema], default: [] })
  items!: PriceListItemSchemaClass[];

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

  // Moderační skrytí (parity s herbářem). Čtení filtruje `$ne: true`.
  @Prop({ type: Boolean, default: false, index: true })
  moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
}

export const PriceListSchema =
  SchemaFactory.createForClass(PriceListSchemaClass);
// List dvou knihoven (schválené / návrhy) abecedně.
PriceListSchema.index({ status: 1, name: 1 });
