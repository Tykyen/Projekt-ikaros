import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

class GalleryRatingSchema {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true, min: 1, max: 5 }) stars: number;
  // 3.4f — recenze: denormalizované jméno + volitelný text
  @Prop({ default: '' }) userName: string;
  @Prop({ default: '' }) text: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
}

export type IkarosGalleryDocument = HydratedDocument<IkarosGallerySchemaClass>;

@Schema({ collection: 'ikaros_gallery' })
export class IkarosGallerySchemaClass {
  @Prop({ required: true }) title: string;
  @Prop() description?: string;
  @Prop({ required: true }) imageUrl: string;
  // 3.3a — Cloudinary public_id pro mazání assetu při delete
  @Prop({ default: '' }) publicId: string;
  // 3.3a — rozměry pro masonry aspect-ratio (0 = starý dokument, FE fallback 1:1)
  @Prop({ default: 0 }) width: number;
  @Prop({ default: 0 }) height: number;
  // 3.3a — slug kategorie, FK → gallery_categories.key
  @Prop({ default: 'ostatni' }) category: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ default: 'Draft' }) status: string;
  @Prop() rejectReason?: string;
  @Prop({ type: [GalleryRatingSchema], default: [] })
  ratings: GalleryRatingSchema[];
  @Prop({ default: 0 }) averageRating: number;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop({ default: () => new Date() }) updatedAtUtc: Date;
  @Prop() publishedAtUtc?: Date;
}

export const IkarosGallerySchema = SchemaFactory.createForClass(
  IkarosGallerySchemaClass,
);
IkarosGallerySchema.index({ authorId: 1 });
IkarosGallerySchema.index({ status: 1, createdAtUtc: -1 });
IkarosGallerySchema.index({ category: 1 });
