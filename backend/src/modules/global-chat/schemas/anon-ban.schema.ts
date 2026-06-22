import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AnonBanDocument = HydratedDocument<AnonBanSchemaClass>;

/**
 * Spec 15.8 — ban hosta (anonyma) v Hospodě. Váže se na `anonId` z guest JWT
 * (dlouhodobá identita, proto má ban smysl). Zabanovaný host dostane 403 při
 * psaní (global-chat.service). Admin/Superadmin přidává (global-chat.controller).
 */
@Schema({ timestamps: true, collection: 'anon_bans' })
export class AnonBanSchemaClass {
  /** anon-id z guest JWT (`sub`). */
  @Prop({ required: true, unique: true, index: true }) anonId: string;
  /** userId Admina/Superadmina, který ban provedl. */
  @Prop({ required: true }) bannedBy: string;
}

export const AnonBanSchema = SchemaFactory.createForClass(AnonBanSchemaClass);
