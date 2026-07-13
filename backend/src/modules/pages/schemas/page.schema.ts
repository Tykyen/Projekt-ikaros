import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type PageDocument = HydratedDocument<PageSchemaClass>;

@Schema({ timestamps: true, collection: 'pages' })
export class PageSchemaClass {
  @Prop({ required: true }) slug: string;
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true, default: 'Ostatní' }) type: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) content: string;
  // Pravidlová kniha — taháková rekapitulace pro HUD „Rychlý přehled".
  @Prop({ default: '' }) quickRef?: string;
  @Prop() imageUrl?: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10); staré docs nemají. */
  @Prop() imageBytes?: number;
  @Prop({ default: false }) bigImage?: boolean;
  // Parita s GameEvent — výřez hlavního obrázku (focal/zoom/fit), default null.
  @Prop({ default: null, type: Number }) imageFocalX?: number | null;
  @Prop({ default: null, type: Number }) imageFocalY?: number | null;
  @Prop({ default: null, type: Number }) imageZoom?: number | null;
  @Prop({ default: null, type: String, enum: ['cover', 'contain', null] })
  imageFit?: 'cover' | 'contain' | null;
  @Prop({ type: Object }) table?: Record<string, unknown>;
  // 17.7 — vizuální rodokmen (strom rodiny). Raw Object jako `table`. BEZ
  // defaultu — pole existuje JEN na stránkách typu Rodokmen (service ho tam
  // nastaví). Jeho přítomnost odlišuje nový typ „Rodokmen" od legacy (velký
  // obrázek → Zoom); viz normalizePageType.
  @Prop({ type: Object })
  familyTree?: {
    people: Record<string, unknown>[];
    unions: Record<string, unknown>[];
  };
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  sections: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  galleryImages: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  videos: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  menu: Record<string, unknown>[];
  @Prop({ default: '' }) plainText: string;
  @Prop({ default: false }) isWoodWide: boolean;
  // B4b (spec 20B) — moderační skrytí (akce M2/M3). Globální zásah: skrytou
  // stránku nevidí ani členové/PJ světa, jen platform reviewer set. Default false.
  @Prop({ default: false }) moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  accessRequirements: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData?: Record<string, string>;
  @Prop({ default: 0 }) order: number;
  // Krok 9.1 — pole pro PostavaHrace / NPC.
  @Prop({ index: true }) ownerUserId?: string;
  @Prop({ type: Object }) characterRef?: { characterId: string };
  // AKJ chráněné záložky — flexibilní subdok (name/level/order/access/
  // contentOverride). Filtrace dle přístupu řeší service vrstva ve `findBySlug`.
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  akjTabs?: Record<string, unknown>[];
}

export const PageSchema = SchemaFactory.createForClass(PageSchemaClass);
PageSchema.index({ worldId: 1, slug: 1 }, { unique: true });
PageSchema.index({ worldId: 1, type: 1 });
