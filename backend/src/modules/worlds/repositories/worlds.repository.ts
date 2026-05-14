import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { WorldSchemaClass } from '../schemas/world.schema';
import { World, WorldCalendarConfig } from '../interfaces/world.interface';
import type { IWorldsRepository } from '../interfaces/worlds-repository.interface';

@Injectable()
export class MongoWorldsRepository
  extends BaseMongoRepository<World>
  implements IWorldsRepository
{
  constructor(
    @InjectModel(WorldSchemaClass.name)
    model: Model<WorldSchemaClass>,
  ) {
    super(model as never);
  }

  async findByIds(ids: string[]): Promise<World[]> {
    const validIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: validIds }, isActive: true })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.model
      .countDocuments({ slug: slug.toLowerCase() })
      .exec();
    return count > 0;
  }

  async increment(id: string, field: string, by: number): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.findByIdAndUpdate(id, { $inc: { [field]: by } }).exec();
  }

  async findBySlug(slug: string): Promise<World | null> {
    const doc = await this.model
      .findOne({ slug: slug.toLowerCase(), isActive: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findAll(): Promise<World[]> {
    const docs = await this.model.find({ isActive: true }).lean().exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findByOwnerId(ownerId: string): Promise<World[]> {
    const docs = await this.model
      .find({ ownerId, isActive: true })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async addFavoriteSlug(worldId: string, slug: string): Promise<void> {
    if (!Types.ObjectId.isValid(worldId)) return;
    await this.model
      .findByIdAndUpdate(worldId, { $addToSet: { favoritePageSlugs: slug } })
      .exec();
  }

  async removeFavoriteSlug(worldId: string, slug: string): Promise<void> {
    if (!Types.ObjectId.isValid(worldId)) return;
    await this.model
      .findByIdAndUpdate(worldId, { $pull: { favoritePageSlugs: slug } })
      .exec();
  }

  async updateCalendarConfig(
    id: string,
    config: WorldCalendarConfig,
  ): Promise<World | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { calendarConfig: config } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  protected toEntity(doc: Record<string, unknown>): World {
    return {
      id: String(doc._id),
      name: doc.name as string,
      slug: doc.slug as string,
      description: doc.description as string | undefined,
      imageUrl: doc.imageUrl as string | undefined,
      genre: doc.genre as string | undefined,
      tones: (doc.tones as string[]) ?? [],
      playersWanted: doc.playersWanted as string | undefined,
      playerCount: (doc.playerCount as number) ?? 0,
      maxPlayers: (doc.maxPlayers as number | null | undefined) ?? null,
      dice: (doc.dice as string[]) ?? [],
      system: (doc.system as string) ?? 'matrix',
      ownerId: doc.ownerId as string,
      isActive: (doc.isActive as boolean) ?? true,
      accessMode: (doc.accessMode as string) ?? 'private',
      offeredCharacters:
        (doc.offeredCharacters as { slug: string; name: string }[]) ?? [],
      calendarConfig: doc.calendarConfig as World['calendarConfig'],
      favoritePageSlugs: (doc.favoritePageSlugs as string[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
