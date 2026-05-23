import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterNotesDocument =
  HydratedDocument<CharacterNotesSchemaClass>;

// D-073 (2026-05-23) — timestamps pro optimistic concurrency.
@Schema({ timestamps: true, collection: 'character_notes' })
export class CharacterNotesSchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ default: '' }) content: string;
}

export const CharacterNotesSchema = SchemaFactory.createForClass(
  CharacterNotesSchemaClass,
);
CharacterNotesSchema.index({ characterId: 1 }, { unique: true });
