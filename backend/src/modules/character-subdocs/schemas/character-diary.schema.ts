import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterDiaryDocument =
  HydratedDocument<CharacterDiarySchemaClass>;

@Schema({ collection: 'character_diaries' })
export class CharacterDiarySchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ type: [Object], default: [] }) sections: Record<string, unknown>[];
  @Prop({ type: [Object] }) personalDiarySchema?: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData: Record<string, unknown>;
}

export const CharacterDiarySchema = SchemaFactory.createForClass(
  CharacterDiarySchemaClass,
);
CharacterDiarySchema.index({ characterId: 1 }, { unique: true });
