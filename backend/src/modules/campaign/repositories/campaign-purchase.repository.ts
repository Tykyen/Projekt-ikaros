import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignPurchaseSchemaClass } from '../schemas/campaign-purchase.schema';
import type {
  CampaignPurchase,
  CampaignPurchaseItemSnapshot,
} from '../interfaces/campaign-purchase.interface';
import type { ICampaignPurchaseRepository } from '../interfaces/campaign-purchase-repository.interface';

@Injectable()
export class MongoCampaignPurchaseRepository
  extends BaseMongoRepository<CampaignPurchase>
  implements ICampaignPurchaseRepository
{
  constructor(
    @InjectModel(CampaignPurchaseSchemaClass.name)
    model: Model<CampaignPurchaseSchemaClass>,
  ) {
    super(model as never);
  }

  async findMany(
    filter: Record<string, unknown>,
    sort: Record<string, unknown> = { createdAt: -1 },
  ): Promise<CampaignPurchase[]> {
    const docs = await this.model
      .find(filter)
      .sort(sort as never)
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async create(
    data: Partial<CampaignPurchase>,
    session?: ClientSession,
  ): Promise<CampaignPurchase> {
    // RC-E5 — `model.create` se session se předává jako pole + options.
    const [doc] = await this.model.create([data], session ? { session } : {});
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<CampaignPurchase>,
  ): Promise<CampaignPurchase | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * RC-E2 fix — atomický flip `active` → `refunded`. Podmínka `status:'active'`
   * ve filtru zajistí, že ze dvou souběžných stornů uspěje právě jedno (druhé
   * dostane null = už není aktivní). Brání double-refundu (peníze 2×).
   */
  async markRefundedIfActive(
    id: string,
    session?: ClientSession,
  ): Promise<CampaignPurchase | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = this.model.findOneAndUpdate(
      { _id: id, status: 'active' },
      { $set: { status: 'refunded', refundedAt: new Date() } },
      { new: true },
    );
    if (session) q.session(session);
    const doc = await q.lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * DUR (styl 43) — kompenzace k `markRefundedIfActive`: když kredit po flipu
   * selže, vrať status zpět na `active`, ať jde storno bezpečně zopakovat
   * (jinak `refunded` bez vrácených peněz = trvalá ztráta / hráč zablokován).
   * Filtr `status:'refunded'` = idempotence.
   */
  async markActiveIfRefunded(
    id: string,
    session?: ClientSession,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    const q = this.model.updateOne(
      { _id: id, status: 'refunded' },
      { $set: { status: 'active' }, $unset: { refundedAt: '' } },
    );
    if (session) q.session(session);
    await q.exec();
  }

  protected toEntity(doc: Record<string, unknown>): CampaignPurchase {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      characterId: doc.characterId as string,
      buyerUserId: doc.buyerUserId as string,
      shopItemId: doc.shopItemId as string,
      itemSnapshot: (doc.itemSnapshot as CampaignPurchaseItemSnapshot) ?? {
        name: '',
        unitPrice: 0,
        currencyCode: '',
        discountPercent: 0,
      },
      quantity: (doc.quantity as number) ?? 1,
      unitPriceOriginal: (doc.unitPriceOriginal as number) ?? 0,
      discountPercent: (doc.discountPercent as number) ?? 0,
      accountId: doc.accountId as string,
      accountTransactionId: (doc.accountTransactionId as string) ?? '',
      paidAmount: (doc.paidAmount as number) ?? 0,
      paidCurrency: (doc.paidCurrency as string) ?? '',
      inventorySectionId: (doc.inventorySectionId as string) ?? '',
      inventoryItemId: (doc.inventoryItemId as string) ?? '',
      status: (doc.status as 'active' | 'refunded') ?? 'active',
      refundedAt: doc.refundedAt as Date | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
