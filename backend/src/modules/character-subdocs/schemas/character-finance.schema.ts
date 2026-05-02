import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterFinanceDocument = HydratedDocument<CharacterFinanceSchemaClass>;

@Schema({ collection: 'character_finances' })
export class CharacterFinanceSchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({ default: 'Osobní' }) accountType: string;
  @Prop({ default: '' }) accessLocation: string;
  @Prop({ default: '' }) currency: string;
  @Prop() lastSyncDate?: Date;
  @Prop({ default: 0 }) balance: number;
  @Prop({ type: [Object], default: [] }) entries: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) transactions: Record<string, unknown>[];
}

export const CharacterFinanceSchema = SchemaFactory.createForClass(CharacterFinanceSchemaClass);
CharacterFinanceSchema.index({ characterId: 1 }, { unique: true });
