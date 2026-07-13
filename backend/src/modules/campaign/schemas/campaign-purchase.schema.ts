import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignPurchaseDocument =
  HydratedDocument<CampaignPurchaseSchemaClass>;

/**
 * Krok 11.3 §5.1 — purchase log. Kotva pro storno + audit. Drží reference do
 * účtu (transakce) i inventáře (sekce+položka) a `itemSnapshot` (přežije
 * smazání položky/skupiny z katalogu).
 */
@Schema({ timestamps: true, collection: 'campaignPurchases' })
export class CampaignPurchaseSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) characterId: string;
  @Prop({ required: true }) buyerUserId: string;
  @Prop({ required: true }) shopItemId: string;
  @Prop({ type: Object, default: {} }) itemSnapshot: Record<string, unknown>;
  @Prop({ default: 1 }) quantity: number;
  @Prop({ default: 0 }) unitPriceOriginal: number;
  @Prop({ default: 0 }) discountPercent: number;
  @Prop({ required: true }) accountId: string;
  @Prop({ default: '' }) accountTransactionId: string;
  @Prop({ default: 0 }) paidAmount: number;
  @Prop({ default: '' }) paidCurrency: string;
  @Prop({ default: '' }) inventorySectionId: string;
  @Prop({ default: '' }) inventoryItemId: string;
  @Prop({ default: 'active' }) status: string; // 'active' | 'refunded'
  @Prop() refundedAt?: Date;
  /** D-PURCHASE-IDEMPOTENCY — klientský nonce (UUID v4), unique per buyer. */
  @Prop({ type: String, default: null }) clientNonce: string | null;
}

export const CampaignPurchaseSchema = SchemaFactory.createForClass(
  CampaignPurchaseSchemaClass,
);
CampaignPurchaseSchema.index({ worldId: 1, characterId: 1, status: 1 });
CampaignPurchaseSchema.index({ worldId: 1, createdAt: -1 });
// D-PURCHASE-IDEMPOTENCY — idempotentní retry (vzor chat 6.2h): dva nákupy se
// stejným nonce od téhož uživatele = jeden purchase log. Unique JEN pro string
// nonce (partialFilterExpression) — legacy/bez-nonce nákupy (null) se
// neindexují a nekolidují. Scope per buyerUserId → kolize mezi uživateli
// nehrozí. Index je zdroj pravdy pro race dvou paralelních requestů: druhý
// insert spadne na E11000 → service vrátí PŮVODNÍ nákup (replay), ne 2. odečet.
CampaignPurchaseSchema.index(
  { buyerUserId: 1, clientNonce: 1 },
  {
    unique: true,
    partialFilterExpression: { clientNonce: { $type: 'string' } },
  },
);
