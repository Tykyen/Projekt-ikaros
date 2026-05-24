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
  @Prop() imageUrl?: string;
  @Prop({ default: false }) bigImage?: boolean;
  @Prop({ type: Object }) table?: Record<string, unknown>;
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
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  accessRequirements: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData?: Record<string, string>;
  @Prop({ default: 0 }) order: number;
  // Krok 9.1 — pole pro PostavaHrace / NPC. Defaultně prázdné/undefined
  // pro wiki typy. Permission filtering řeší service vrstva před returnem.
  @Prop({ default: '' }) privateContent?: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  privateInfoBlocks?: Record<string, unknown>[];
  @Prop({ index: true }) ownerUserId?: string;
  @Prop({ type: Object }) characterRef?: { characterId: string };
}

export const PageSchema = SchemaFactory.createForClass(PageSchemaClass);
PageSchema.index({ worldId: 1, slug: 1 }, { unique: true });
PageSchema.index({ worldId: 1, type: 1 });
