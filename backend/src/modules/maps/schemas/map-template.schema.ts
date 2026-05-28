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
}

export const MapTemplateSchema = SchemaFactory.createForClass(
  MapTemplateSchemaClass,
);

// 10.2c-edit-2 — compound index pro findByOwner (sort updatedAt desc)
MapTemplateSchema.index({ ownerId: 1, updatedAt: -1 });
