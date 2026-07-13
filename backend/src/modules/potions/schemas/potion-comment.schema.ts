/**
 * 21.5b — komentáře komunitních lektvarů (kolekce `potion_comments`). Dvě
 * úrovně přes `targetType`: 'potion' = o lektvaru / lore, 'statblock' = ke
 * statům jednoho systému. Vzor: spell-comment.schema (21.5c).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PotionCommentDocument = HydratedDocument<PotionCommentSchemaClass>;

@Schema({ timestamps: true, collection: 'potion_comments' })
export class PotionCommentSchemaClass {
  @Prop({ required: true, index: true }) potionId!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['potion', 'statblock'],
    index: true,
  })
  targetType!: 'potion' | 'statblock';

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

export const PotionCommentSchema = SchemaFactory.createForClass(
  PotionCommentSchemaClass,
);
// Vlákno jedné úrovně (lektvar, nebo statblok daného systému) chronologicky.
PotionCommentSchema.index({
  potionId: 1,
  targetType: 1,
  systemId: 1,
  createdAt: 1,
});
