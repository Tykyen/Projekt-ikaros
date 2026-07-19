/**
 * 21.5e — Item schema (předměty, komunitní katalog, kolekce `community_items`).
 *
 * Jen komunitní scope (vzor spells/plants) + jádro navíc: druh (`kind` — řídí
 * variantu polí statbloku ve FE) a navrhovaná cena. `statblocks` per systém
 * schema-less — šablony vynucuje FE (spec R6).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ItemStatblockEntry } from '../interfaces/item.interface';
import { sortKeyPlugin } from '../../../common/utils/name-sort';

export type ItemDocument = HydratedDocument<ItemSchemaClass>;

@Schema({ timestamps: true, collection: 'community_items' })
export class ItemSchemaClass {
  @Prop({ required: true, enum: ['community'], default: 'community' })
  scope!: 'community';

  /** Primární systém (předmět vznikl pro něj) — filtr knihovny. */
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

  /** Druh předmětu (zbraň/zbroj/…) — filtr + volba varianty polí (spec R1/R2). */
  @Prop({ required: true, index: true }) kind!: string;

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
  statblocks!: Record<string, ItemStatblockEntry>;
}

export const ItemSchema = SchemaFactory.createForClass(ItemSchemaClass);
sortKeyPlugin(ItemSchema, 'name', 'nameSort');
// List dvou knihoven + filtr druhu / primárního systému.
ItemSchema.index({ status: 1, kind: 1 });
ItemSchema.index({ status: 1, systemId: 1 });
