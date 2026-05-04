import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignShopItemSchemaClass } from '../schemas/campaign-shop-item.schema';
import type { CampaignShopItem } from '../interfaces/campaign-shop-item.interface';
import type { ICampaignShopItemRepository } from '../interfaces/campaign-shop-item-repository.interface';

@Injectable()
export class MongoCampaignShopItemRepository
  extends BaseMongoRepository<CampaignShopItem>
  implements ICampaignShopItemRepository
{
  constructor(@InjectModel(CampaignShopItemSchemaClass.name) model: Model<CampaignShopItemSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { group: 1, updatedAt: -1 }): Promise<CampaignShopItem[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<CampaignShopItem>): Promise<CampaignShopItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignShopItem>): Promise<CampaignShopItem | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async pullLinkedItem(worldId: string, deletedId: string): Promise<void> {
    await this.model.updateMany(
      { worldId, linkedItemIds: deletedId },
      { $pull: { linkedItemIds: deletedId } },
    ).exec();
  }

  protected toEntity(doc: Record<string, unknown>): CampaignShopItem {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      name: doc.name as string,
      description: doc.description as string | undefined,
      group: (doc.group as string) ?? '',
      subgroup: doc.subgroup as string | undefined,
      price: (doc.price as number) ?? 0,
      currencyCode: (doc.currencyCode as string) ?? '',
      linkedItemIds: (doc.linkedItemIds as string[]) ?? [],
      referenceLink: doc.referenceLink as string | undefined,
      isRecommended: (doc.isRecommended as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
