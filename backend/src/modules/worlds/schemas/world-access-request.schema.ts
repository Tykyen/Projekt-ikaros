import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldAccessRequestDocument =
  HydratedDocument<WorldAccessRequestSchemaClass>;

/**
 * Spec 2.4 — pre-membership entita pro open/private světy.
 * Uživatel klikne „Požádat o vstup" → vznikne AR → PJ schválí ve Zpracovat tabu
 * → AR se smaže + vznikne `WorldMembership` s rolí `Ctenar`.
 *
 * Odlišení od `WorldMembership` s rolí `Zadatel`: Zadatel = už člen, čeká na
 * postavu (fáze 5+). AR = ještě není člen, čeká na schválení vstupu.
 */
@Schema({ timestamps: false, collection: 'worldaccessrequests' })
export class WorldAccessRequestSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) userId: string;
  @Prop({ default: Date.now }) requestedAt: Date;
}

export const WorldAccessRequestSchema = SchemaFactory.createForClass(
  WorldAccessRequestSchemaClass,
);

// 1 pending request per (svět, user) — zabraňuje spam-requests.
WorldAccessRequestSchema.index({ worldId: 1, userId: 1 }, { unique: true });
WorldAccessRequestSchema.index({ worldId: 1 });
