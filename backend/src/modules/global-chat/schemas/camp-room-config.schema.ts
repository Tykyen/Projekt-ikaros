import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampRoomConfigDocument =
  HydratedDocument<CampRoomConfigSchemaClass>;

/**
 * Spec 16.6a — trvalý admin override defaultního žánru Campu („víc fantasy").
 * Malá kolekce (max 3 dokumenty, jeden per camp). Cron rotace čte odtud
 * (fallback na konstantu `CAMP_DEFAULT_GENRE`, když admin nic nepřepsal).
 * Admin+ mění přes `PUT /global-chat/rooms/:room/default`.
 */
@Schema({ timestamps: true, collection: 'camproomconfigs' })
export class CampRoomConfigSchemaClass {
  /** Místnost (camp-1/2/3) — unikát → 1 config per camp. */
  @Prop({ required: true, unique: true, index: true }) room: string;
  /** Přepsaný default žánr (fantasy|scifi|mystic). */
  @Prop({ required: true }) style: string;
}

export const CampRoomConfigSchema = SchemaFactory.createForClass(
  CampRoomConfigSchemaClass,
);
