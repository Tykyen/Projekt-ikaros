import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldElevationSchemaClass } from '../schemas/world-elevation.schema';
import type { IWorldElevationsRepository } from '../interfaces/world-elevations-repository.interface';

@Injectable()
export class MongoWorldElevationsRepository implements IWorldElevationsRepository {
  constructor(
    @InjectModel(WorldElevationSchemaClass.name)
    private readonly model: Model<WorldElevationSchemaClass>,
  ) {}

  async upsert(userId: string, worldId: string): Promise<void> {
    await this.model
      .updateOne(
        { userId, worldId },
        { $setOnInsert: { userId, worldId, activatedAt: new Date() } },
        { upsert: true },
      )
      .exec();
  }

  async delete(userId: string, worldId: string): Promise<void> {
    await this.model.deleteOne({ userId, worldId }).exec();
  }

  async listWorldIds(userId: string): Promise<string[]> {
    const docs = await this.model
      .find({ userId })
      .select('worldId')
      .lean()
      .exec();
    return docs.map((d) => (d as { worldId: string }).worldId);
  }

  async exists(userId: string, worldId: string): Promise<boolean> {
    const doc = await this.model.findOne({ userId, worldId }).lean().exec();
    return !!doc;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.model.deleteMany({ userId }).exec();
  }
}
