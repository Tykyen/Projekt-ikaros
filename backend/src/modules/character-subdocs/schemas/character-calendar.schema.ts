import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterCalendarDocument =
  HydratedDocument<CharacterCalendarSchemaClass>;

@Schema({ collection: 'character_calendars' })
export class CharacterCalendarSchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ default: '#3B82F6' }) color: string;
  @Prop({ type: Object, default: {} }) displaySettings: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) events: Record<string, unknown>[];
}

export const CharacterCalendarSchema = SchemaFactory.createForClass(
  CharacterCalendarSchemaClass,
);
CharacterCalendarSchema.index({ characterId: 1 }, { unique: true });
CharacterCalendarSchema.index({ worldId: 1 });
