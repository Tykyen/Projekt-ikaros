/**
 * 21.5f — komentáře ceníků (kolekce `price_list_comments`). Jedna úroveň —
 * diskuse k celému ceníku (žádný targetType/statblock, R7). Vzor:
 * item-comment.schema.ts, zjednodušeno.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PriceListCommentDocument =
  HydratedDocument<PriceListCommentSchemaClass>;

@Schema({ timestamps: true, collection: 'price_list_comments' })
export class PriceListCommentSchemaClass {
  @Prop({ required: true, index: true }) priceListId!: string;

  @Prop({ required: true }) authorId!: string;
  @Prop({ required: true }) authorName!: string;
  @Prop({ required: true }) content!: string;

  // Moderační skrytí (spec 20B) — veřejné čtení skrytý komentář vynechá.
  @Prop({ type: Boolean, default: false, index: true })
  moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
}

export const PriceListCommentSchema = SchemaFactory.createForClass(
  PriceListCommentSchemaClass,
);
// Vlákno ceníku chronologicky.
PriceListCommentSchema.index({ priceListId: 1, createdAt: 1 });
