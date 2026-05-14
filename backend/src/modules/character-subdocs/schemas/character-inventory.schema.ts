import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterInventoryDocument =
  HydratedDocument<CharacterInventorySchemaClass>;

@Schema({ collection: 'character_inventories' })
export class CharacterInventorySchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({ type: [Object], default: [] }) sections: Record<string, unknown>[];
}

export const CharacterInventorySchema = SchemaFactory.createForClass(
  CharacterInventorySchemaClass,
);
CharacterInventorySchema.index({ characterId: 1 }, { unique: true });
