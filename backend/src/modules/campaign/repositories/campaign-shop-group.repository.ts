import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignShopGroupSchemaClass } from '../schemas/campaign-shop-group.schema';
import type { CampaignShopGroup } from '../interfaces/campaign-shop-group.interface';
import type { ICampaignShopGroupRepository } from '../interfaces/campaign-shop-group-repository.interface';

@Injectable()
export class MongoCampaignShopGroupRepository
  extends BaseMongoRepository<CampaignShopGroup>
  implements ICampaignShopGroupRepository
{
  constructor(
    @InjectModel(CampaignShopGroupSchemaClass.name)
    model: Model<CampaignShopGroupSchemaClass>,
  ) {
    super(model as never);
  }

  async findMany(
    filter: Record<string, unknown>,
    sort: Record<string, unknown> = { order: 1, name: 1 },
  ): Promise<CampaignShopGroup[]> {
    const docs = await this.model
      .find(filter)
      .sort(sort as never)
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async create(data: Partial<CampaignShopGroup>): Promise<CampaignShopGroup> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<CampaignShopGroup>,
  ): Promise<CampaignShopGroup | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async countChildren(worldId: string, parentId: string): Promise<number> {
    return this.model.countDocuments({ worldId, parentId }).exec();
  }

  protected toEntity(doc: Record<string, unknown>): CampaignShopGroup {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      name: doc.name as string,
      parentId: doc.parentId as string | undefined,
      order: (doc.order as number) ?? 0,
      discountPercent: (doc.discountPercent as number) ?? 0,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
