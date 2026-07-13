/**
 * 21.5d — komentáře komunitních hádanek (kolekce `riddle_comments`).
 * JEDNA úroveň (hádanky nemají statblocky — spec R1). Vzor: spell-comment,
 * zjednodušeno o targetType/systemId.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RiddleCommentDocument = HydratedDocument<RiddleCommentSchemaClass>;

@Schema({ timestamps: true, collection: 'riddle_comments' })
export class RiddleCommentSchemaClass {
  @Prop({ required: true, index: true }) riddleId!: string;

  @Prop({ required: true }) authorId!: string;
  @Prop({ required: true }) authorName!: string;
  @Prop({ required: true }) content!: string;

  // Moderační skrytí (spec 20B) — veřejné čtení skrytý komentář vynechá.
  @Prop({ type: Boolean, default: false, index: true })
  moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
}

export const RiddleCommentSchema = SchemaFactory.createForClass(
  RiddleCommentSchemaClass,
);
// Vlákno hádanky chronologicky.
RiddleCommentSchema.index({ riddleId: 1, createdAt: 1 });
