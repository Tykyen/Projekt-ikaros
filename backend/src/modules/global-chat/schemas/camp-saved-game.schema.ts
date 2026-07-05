import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Spec 16.6b — jeden zobrazitelný řádek snímku uložené hry. Immutable kopie
 * (jméno + text + barva + čas), NE živá reference na `ChatMessage` — snímek se
 * nesmí rozbít, když autor/postava později změní jméno nebo se zpráva smaže.
 */
export interface SavedChatLine {
  senderName: string;
  content: string;
  color: string | null;
  createdAt: Date;
}

export type CampSavedGameDocument = HydratedDocument<CampSavedGameSchemaClass>;

/**
 * Spec 16.6b — uložená „hra" v Campu (kotva „kde jsme skončili"). Jeden slot
 * per hráč (`userId` unique → save = upsert, přepíše předchozí). Drží snímek
 * scény (room + style + placeId) a posledních ~20 veřejných zpráv v okamžiku
 * uložení. Přežije restart BE (na rozdíl od in-memory prostředí místnosti).
 */
@Schema({ timestamps: true, collection: 'campsavedgames' })
export class CampSavedGameSchemaClass {
  /** userId hráče — unikát → 1 slot; save = upsert. */
  @Prop({ required: true, unique: true, index: true }) userId: string;
  /** Místnost, ze které bylo uloženo (camp-1/2/3). */
  @Prop({ required: true }) room: string;
  /** Styl scény v okamžiku uložení (fantasy|scifi|mystic). */
  @Prop({ required: true }) style: string;
  /** ID lokace '1'–'20' v okamžiku uložení. */
  @Prop({ required: true }) placeId: string;
  /** Snímek posledních ~20 veřejných zpráv (bez systémových a whisperů). */
  @Prop({ type: [Object], default: [] }) messages: SavedChatLine[];
  /** Kdy bylo uloženo. */
  @Prop({ required: true }) savedAt: Date;
}

export const CampSavedGameSchema = SchemaFactory.createForClass(
  CampSavedGameSchemaClass,
);
