/**
 * 21.5c — komentáře komunitních kouzel (kolekce `spell_comments`). Dvě úrovně
 * přes `targetType`: 'spell' = o kouzle / lore, 'statblock' = ke statům
 * jednoho systému (balanc se ladí zde). Vzor: bestie-comment.schema.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SpellCommentDocument = HydratedDocument<SpellCommentSchemaClass>;

@Schema({ timestamps: true, collection: 'spell_comments' })
export class SpellCommentSchemaClass {
  @Prop({ required: true, index: true }) spellId!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['spell', 'statblock'],
    index: true,
  })
  targetType!: 'spell' | 'statblock';

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

export const SpellCommentSchema = SchemaFactory.createForClass(
  SpellCommentSchemaClass,
);
// Vlákno jedné úrovně (kouzlo, nebo statblok daného systému) chronologicky.
SpellCommentSchema.index({
  spellId: 1,
  targetType: 1,
  systemId: 1,
  createdAt: 1,
});
