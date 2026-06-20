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
// DI (plný audit 2026-06-20) — index dříve deklarovaný 2×: `@Prop unique` +
// explicitní `.index()` → mongoose „Duplicate schema index" warning. `@Prop`
// unique stačí; explicitní řádek odstraněn (stejný unique index na characterId).
