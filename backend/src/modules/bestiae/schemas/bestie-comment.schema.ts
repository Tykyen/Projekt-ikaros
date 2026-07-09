/**
 * 16.2b-2 — komentáře komunitního bestiáře. Dvě úrovně přes `targetType`:
 * 'beast' = diskuse o bytosti / lore (napříč systémy), 'statblock' = diskuse
 * ke statům jednoho systému (balanc). Staty se ladí právě zde (spec §2a).
 *
 * UX/chování jako stávající diskuse v projektu (`ikaros_discussion_posts`),
 * jen navázané na bytost + systém.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BestieCommentDocument = HydratedDocument<BestieCommentSchemaClass>;

@Schema({ timestamps: true, collection: 'bestie_comments' })
export class BestieCommentSchemaClass {
  @Prop({ required: true, index: true }) bestieId!: string;

  @Prop({ required: true, enum: ['beast', 'statblock'], index: true })
  targetType!: 'beast' | 'statblock';

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

export const BestieCommentSchema = SchemaFactory.createForClass(
  BestieCommentSchemaClass,
);
// Vlákno jedné úrovně (bytost, nebo statblok daného systému) chronologicky.
BestieCommentSchema.index({
  bestieId: 1,
  targetType: 1,
  systemId: 1,
  createdAt: 1,
});
