/**
 * 10.2d-prep-B — Bestie schema (statblok šablona, žádný deník).
 *
 * 4-scope kolekce: 'system' (admin-managed seeds), 'user' (per PJ napříč
 * jeho světy), 'world' (per-svět specifika), 'community' (16.2b-2 — globální
 * komunitní katalog ve Společné tvorbě). `systemStats` storage validátor
 * z 10.2d-prep-A (SystemStatsValidatorService).
 *
 * 16.2b-2: community bytost = sdílený lore + mapa `systém → statblok`
 * (`statblocks`). Staty se NEmění přímou editací — jen schvalovacím tokem
 * (spec-16.2b-2 §2a). Ostatní 3 scope zůstávají single-system (`systemStats`).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BestieStatblockEntry } from '../interfaces/bestie.interface';

export type BestieDocument = HydratedDocument<BestieSchemaClass>;

@Schema({ timestamps: true, collection: 'bestiae' })
export class BestieSchemaClass {
  @Prop({
    required: true,
    enum: ['system', 'user', 'world', 'community'],
    index: true,
  })
  scope!: 'system' | 'user' | 'world' | 'community';

  @Prop({ required: true, index: true }) systemId!: string;

  @Prop({ index: true, sparse: true }) ownerUserId?: string;
  @Prop({ index: true, sparse: true }) worldId?: string;

  @Prop({ required: true }) name!: string;
  @Prop() imageUrl?: string;
  // Výřez obrázku (parity s GameEvent/WorldNews). null = default (focal 50/50).
  @Prop({ type: Number, default: null }) imageFocalX?: number | null;
  @Prop({ type: Number, default: null }) imageFocalY?: number | null;
  @Prop({ type: Number, default: null }) imageZoom?: number | null;
  @Prop({ type: String, default: null }) imageFit?: 'cover' | 'contain' | null;
  // GM poznámky (jen PJ). Popis bytosti je v `description`.
  @Prop({ default: '' }) notes!: string;

  // Veřejný popis bytosti (jak vypadá / se chová) — 16.2h motivové vzhledy.
  @Prop({ default: '' }) description!: string;

  // Schopnosti jsou součást `systemStats.abilities` (per-system schéma).
  // Top-level pole `abilities` zrušeno (D-NEW-BESTIE-ABILITIES-DUP) — editor do
  // něj nikdy nepsal; existující dokumenty mají jen prázdné [], data nemizí.
  @Prop({ type: Object, default: {} })
  systemStats!: Record<string, unknown>;

  @Prop() clonedFromId?: string;

  @Prop({ type: Date, default: null }) deletedAt!: Date | null;

  // B5 (spec 20B) — moderační skrytí (M2/M3). Čtení filtruje `$ne: true`.
  @Prop({ type: Boolean, default: false, index: true })
  moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;

  // ── 16.2b-2 komunitní scope (dává smysl jen pro scope='community') ──
  /** Latinský/ozdobný název (podtitul v knize). */
  @Prop() latin?: string;
  /** Typ bytosti (drak/nemrtvý/…) — filtr knihovny. */
  @Prop({ index: true, sparse: true }) kind?: string;
  @Prop({ type: [String], default: undefined }) tags?: string[];
  /** Stav bytosti: 'draft' = knihovna návrhů, 'approved' = schválená knihovna. */
  @Prop({ enum: ['draft', 'approved'], index: true, sparse: true })
  status?: 'draft' | 'approved';
  /** Atribuce autora (povinná u community). */
  @Prop({ index: true, sparse: true }) authorId?: string;
  @Prop({ type: Date, default: null }) approvedAt?: Date | null;
  @Prop() approvedBy?: string;
  /**
   * Mapa systém→statblok (16.2b-2). Klíč = systemId; hodnota = staty + stav +
   * autor. Staty se ladí schvalovacím tokem (spec §2a), ne přímým zápisem.
   */
  @Prop({ type: Object, default: {} })
  statblocks?: Record<string, BestieStatblockEntry>;
}

export const BestieSchema = SchemaFactory.createForClass(BestieSchemaClass);
BestieSchema.index({ scope: 1, systemId: 1 });
BestieSchema.index({ scope: 1, ownerUserId: 1, systemId: 1 });
BestieSchema.index({ scope: 1, worldId: 1, systemId: 1 });
// 16.2b-2 — list dvou knihoven (schválené / návrhy) + filtr typu.
BestieSchema.index({ scope: 1, status: 1, kind: 1 });
