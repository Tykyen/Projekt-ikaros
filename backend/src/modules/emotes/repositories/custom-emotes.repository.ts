import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomEmoteDocument } from '../schemas/custom-emote.schema';
import { CustomEmote } from '../interfaces/custom-emote.interface';
import { ICustomEmotesRepository } from '../interfaces/custom-emotes-repository.interface';

@Injectable()
export class MongoCustomEmotesRepository implements ICustomEmotesRepository {
  constructor(
    @InjectModel(CustomEmoteDocument.name)
    private readonly model: Model<CustomEmoteDocument>,
  ) {}

  private toEntity(doc: Record<string, unknown>): CustomEmote {
    return {
      id: String(doc._id),
      // doc.worldId je Mongoose ObjectId nebo string — má vlastní toString().
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      worldId: doc.worldId ? String(doc.worldId) : null,
      name: doc.name as string,
      shortcode: doc.shortcode as string,
      imageId: doc.imageId as string,
      imageUrl: doc.imageUrl as string,
      createdBy: String(doc.createdBy),
      tags: (doc.tags as string[]) ?? [],
      createdAt: doc.createdAt as Date,
    };
  }

  async findByWorldId(worldId: string): Promise<CustomEmote[]> {
    const docs = await this.model
      .find({ worldId: new Types.ObjectId(worldId) })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findGlobal(): Promise<CustomEmote[]> {
    const docs = await this.model.find({ worldId: null }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<CustomEmote | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByShortcode(
    shortcode: string,
    worldId: string | null,
  ): Promise<CustomEmote | null> {
    const query = worldId
      ? { shortcode, worldId: new Types.ObjectId(worldId) }
      : { shortcode, worldId: null };
    const doc = await this.model.findOne(query).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(
    data: Omit<CustomEmote, 'id' | 'createdAt'>,
  ): Promise<CustomEmote> {
    const doc = await this.model.create({
      worldId: data.worldId ? new Types.ObjectId(data.worldId) : null,
      name: data.name,
      shortcode: data.shortcode,
      imageId: data.imageId,
      imageUrl: data.imageUrl,
      createdBy: new Types.ObjectId(data.createdBy),
    });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async updateById(
    id: string,
    updates: Partial<
      Pick<CustomEmote, 'name' | 'shortcode' | 'imageId' | 'imageUrl'>
    >,
  ): Promise<CustomEmote | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, updates, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async countByWorldId(worldId: string): Promise<number> {
    return this.model
      .countDocuments({ worldId: new Types.ObjectId(worldId) })
      .exec();
  }

  async countGlobal(): Promise<number> {
    return this.model.countDocuments({ worldId: null }).exec();
  }
}
