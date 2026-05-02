import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PageDocument = HydratedDocument<PageSchemaClass>;

@Schema({ timestamps: true, collection: 'pages' })
export class PageSchemaClass {
  @Prop({ required: true }) slug: string;
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true, default: 'Ostatní' }) type: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) content: string;
  @Prop() imageUrl?: string;
  @Prop({ default: false }) bigImage?: boolean;
  @Prop({ type: Object }) table?: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) sections: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) galleryImages: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) videos: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) accessRequirements: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData?: Record<string, string>;
  @Prop({ default: 0 }) order: number;
}

export const PageSchema = SchemaFactory.createForClass(PageSchemaClass);
PageSchema.index({ worldId: 1, slug: 1 }, { unique: true });
PageSchema.index({ worldId: 1, type: 1 });
