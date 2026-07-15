import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type MapTemplateDocument = HydratedDocument<MapTemplateSchemaClass>;

/**
 * 10.2c-edit-2 — `ownerId` required (per-PJ vlastnictví), `timestamps: true`
 * (auto createdAt + updatedAt nahrazuje původní `lastModified?`).
 *
 * **Migrace existujících šablon** — viz
 * `scripts/migrate-map-templates-ownerid-10.2c-edit-2/`. Bez backfillu by
 * `required: true` zlomil load všech dokumentů bez `ownerId`.
 */
@Schema({ timestamps: true, collection: 'mapTemplates' })
export class MapTemplateSchemaClass {
  @Prop({ required: true, index: true }) ownerId: string;
  @Prop({ required: true, minlength: 1, maxlength: 100 }) name: string;
  @Prop({ required: true, minlength: 1 }) imageUrl: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré docs nemají. */
  @Prop() imageBytes?: number;
  @Prop({
    type: Object,
    default: { size: 40, originX: 0, originY: 0, showGrid: true },
  })
  config: Record<string, unknown>;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  npcTemplates: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  tokens: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  effects: Record<string, unknown>[];
  @Prop({ default: false }) fogEnabled: boolean;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  revealedHexes: Record<string, unknown>[];
  @Prop({ type: [String], default: [] }) activeSoundIds: string[];

  // ── 22.5 — publikace do veřejného katalogu šablon scén ──
  /** Zveřejněno do katalogu (default false = jen v privátní knihovně). */
  @Prop({ default: false }) published: boolean;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
  /** Snapshot ownerId při publikaci (autorství nezávislé na pozdější změně). */
  @Prop({ type: String, default: null }) authorId: string | null;
  /** Snapshot zobrazovaného jména autora (řeší dluh „jen authorId"). */
  @Prop({ type: String, default: null }) publicAuthorName: string | null;
  /** Kurátorský stav; do katalogu jen 'approved'. */
  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: null,
  })
  reviewStatus: 'pending' | 'approved' | 'rejected' | null;
  /** Moderační skrytí (20B) — z katalogu i klonu ven. */
  @Prop({ default: false }) moderationHidden: boolean;
  @Prop({ type: String, default: null }) moderationHiddenReason: string | null;
  /** Odkaz na licenční kartu (content_licenses, 20D). */
  @Prop({ type: String, default: null }) licenseId: string | null;
  /** Genealogie — pokud šablona vznikla klonem jiné publikované šablony. */
  @Prop({ type: String, default: null }) clonedFromTemplateId: string | null;
}

export const MapTemplateSchema = SchemaFactory.createForClass(
  MapTemplateSchemaClass,
);

// 10.2c-edit-2 — compound index pro findByOwner (sort updatedAt desc)
MapTemplateSchema.index({ ownerId: 1, updatedAt: -1 });
// 22.5 — katalogový list: published + approved + neskryté.
MapTemplateSchema.index({ published: 1, reviewStatus: 1, moderationHidden: 1 });
