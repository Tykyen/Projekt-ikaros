import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Spec 3.3a — dynamicky spravované kategorie obrázků galerie. Zrcadlí
 * `article_categories`. Admin/Superadmin spravuje přes `/api/gallery-categories`
 * CRUD. Seed 5 výchozích (fanart, mapy, postavy, svety, ostatni) v
 * `GalleryCategoriesSeed` (OnApplicationBootstrap).
 */
@Schema({ collection: 'gallery_categories' })
export class GalleryCategorySchemaClass {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) color: string;
  @Prop({ required: true }) order: number;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
}

export type GalleryCategoryDocument =
  HydratedDocument<GalleryCategorySchemaClass>;

export const GalleryCategorySchema = SchemaFactory.createForClass(
  GalleryCategorySchemaClass,
);

GalleryCategorySchema.index({ order: 1 });
