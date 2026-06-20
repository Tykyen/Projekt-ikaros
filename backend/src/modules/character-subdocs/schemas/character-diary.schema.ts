import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type CharacterDiaryDocument =
  HydratedDocument<CharacterDiarySchemaClass>;

// D-073 (2026-05-23) — timestamps pro optimistic concurrency (`expectedUpdatedAt`).
@Schema({ timestamps: true, collection: 'character_diaries' })
export class CharacterDiarySchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  sections: Record<string, unknown>[];
  @Prop({ type: [MixedArraySubSchema] })
  personalDiarySchema?: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData: Record<string, unknown>;
}

export const CharacterDiarySchema = SchemaFactory.createForClass(
  CharacterDiarySchemaClass,
);
// DI (plný audit 2026-06-20) — characterId unique už z `@Prop unique` (dedup
// mongoose „Duplicate schema index" warning).
