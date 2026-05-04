import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CampaignChangeLogSchemaClass } from '../schemas/campaign-change-log.schema';
import type { CampaignChangeLog } from '../interfaces/campaign-change-log.interface';
import type { ICampaignChangeLogRepository } from '../interfaces/campaign-change-log-repository.interface';

const MAX_LOGS_PER_WORLD = 200;

@Injectable()
export class MongoCampaignChangeLogRepository implements ICampaignChangeLogRepository {
  constructor(@InjectModel(CampaignChangeLogSchemaClass.name) model: Model<CampaignChangeLogSchemaClass>) {
    this.model = model;
  }

  private readonly model: Model<CampaignChangeLogSchemaClass>;

  async append(entry: Omit<CampaignChangeLog, 'id'>): Promise<void> {
    await this.model.create(entry);
    const count = await this.model.countDocuments({ worldId: entry.worldId }).exec();
    if (count > MAX_LOGS_PER_WORLD) {
      const excess = count - MAX_LOGS_PER_WORLD;
      const oldest = await this.model
        .find({ worldId: entry.worldId })
        .sort({ changedAt: 1 })
        .limit(excess)
        .select('_id')
        .lean()
        .exec();
      const ids = oldest.map((d) => d._id);
      await this.model.deleteMany({ _id: { $in: ids } }).exec();
    }
  }

  async findMany(filter: Record<string, unknown>, limit: number): Promise<CampaignChangeLog[]> {
    const docs = await this.model.find(filter).sort({ changedAt: -1 }).limit(limit).lean().exec();
    return docs.map((doc) => ({
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      entityType: doc.entityType as CampaignChangeLog['entityType'],
      entityId: doc.entityId as string,
      entityName: doc.entityName as string,
      changeType: doc.changeType as CampaignChangeLog['changeType'],
      changedByUserId: doc.changedByUserId as string,
      changedByName: doc.changedByName as string,
      changedAt: doc.changedAt as Date,
    }));
  }
}
