import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

  async create(data: Partial<CampaignPurchase>): Promise<CampaignPurchase> {
    const doc = await this.model.create(data);
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
