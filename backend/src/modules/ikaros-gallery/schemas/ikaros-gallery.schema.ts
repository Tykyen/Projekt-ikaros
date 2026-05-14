import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

class GalleryRatingSchema {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true, min: 1, max: 5 }) stars: number;
}

export type IkarosGalleryDocument = HydratedDocument<IkarosGallerySchemaClass>;

@Schema({ collection: 'ikaros_gallery' })
export class IkarosGallerySchemaClass {
  @Prop({ required: true }) title: string;
  @Prop() description?: string;
  @Prop({ required: true }) imageUrl: string;
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
