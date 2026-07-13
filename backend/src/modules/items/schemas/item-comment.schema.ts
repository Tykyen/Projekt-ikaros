/**
 * 21.5e — komentáře komunitních předmětů (kolekce `item_comments`). Dvě
 * úrovně přes `targetType`: 'item' = o předmětu / lore, 'statblock' = ke
 * statům jednoho systému. Vzor: spell-comment.schema (21.5c).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ItemCommentDocument = HydratedDocument<ItemCommentSchemaClass>;

@Schema({ timestamps: true, collection: 'item_comments' })
export class ItemCommentSchemaClass {
  @Prop({ required: true, index: true }) itemId!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['item', 'statblock'],
    index: true,
  })
  targetType!: 'item' | 'statblock';

  /** Jen pro targetType='statblock' — ke které pravidlové verzi patří. */
  @Prop({ index: true, sparse: true }) systemId?: string;

  @Prop({ required: true }) authorId!: string;
  @Prop({ required: true }) authorName!: string;
  @Prop({ required: true }) content!: string;

  // Moderační skrytí (spec 20B) — veřejné čtení skrytý komentář vynechá.
  @Prop({ type: Boolean, default: false, index: true })
  moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
}

export const ItemCommentSchema = SchemaFactory.createForClass(
  ItemCommentSchemaClass,
);
// Vlákno jedné úrovně (předmět, nebo statblok daného systému) chronologicky.
ItemCommentSchema.index({
  itemId: 1,
  targetType: 1,
  systemId: 1,
  createdAt: 1,
});
