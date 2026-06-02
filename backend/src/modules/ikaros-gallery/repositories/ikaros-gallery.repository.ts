import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import type { IIkarosGalleryRepository } from '../interfaces/ikaros-gallery-repository.interface';
import type {
  IkarosGalleryItem,
  GalleryStatus,
  GalleryRating,
} from '../interfaces/ikaros-gallery.interface';
import { IkarosGallerySchemaClass } from '../schemas/ikaros-gallery.schema';

@Injectable()
export class MongoIkarosGalleryRepository implements IIkarosGalleryRepository {
  constructor(
    @InjectModel(IkarosGallerySchemaClass.name)
    private readonly model: Model<IkarosGallerySchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): IkarosGalleryItem {
    return {
      id: String(doc._id),
      title: doc.title as string,
      description: doc.description as string | undefined,
      imageUrl: doc.imageUrl as string,
      publicId: (doc.publicId as string) ?? '',
      width: (doc.width as number) ?? 0,
      height: (doc.height as number) ?? 0,
      category: (doc.category as string) ?? 'ostatni',
      authorId: doc.authorId as string,
      authorName: doc.authorName as string,
      status: doc.status as GalleryStatus,
      rejectReason: doc.rejectReason as string | undefined,
      ratings: (
        (doc.ratings ?? []) as Array<{
          userId: string;
          stars: number;
          userName?: string;
          text?: string;
          createdAtUtc?: Date;
        }>
      ).map((r) => ({
        userId: r.userId,
        stars: r.stars,
        userName: r.userName ?? '',
        text: r.text ?? '',
        createdAtUtc: r.createdAtUtc ?? new Date(0),
      })),
      averageRating: (doc.averageRating as number) ?? 0,
      createdAtUtc: doc.createdAtUtc as Date,
      updatedAtUtc: doc.updatedAtUtc as Date,
      publishedAtUtc: doc.publishedAtUtc as Date | undefined,
    };
  }

  async findPublished(): Promise<IkarosGalleryItem[]> {
    const docs = await this.model
      .find({ status: 'Published' })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findPublishedAndPending(): Promise<IkarosGalleryItem[]> {
    const docs = await this.model
      .find({ status: { $in: ['Published', 'Pending'] } })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findPending(): Promise<IkarosGalleryItem[]> {
    const docs = await this.model
      .find({ status: 'Pending' })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByAuthor(authorId: string): Promise<IkarosGalleryItem[]> {
    const docs = await this.model
      .find({ authorId })
      .sort({ updatedAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByIds(ids: string[]): Promise<IkarosGalleryItem[]> {
    const valid = ids.filter((id) => isValidObjectId(id));
    if (valid.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: valid } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<IkarosGalleryItem | null> {
    // D-071 — nevalidní ObjectId by jinak vyhodil Mongoose CastError → 500.
    // Vrácení null vede service vrstvu na standardní 404.
    if (!isValidObjectId(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(
    data: Omit<IkarosGalleryItem, 'id'>,
  ): Promise<IkarosGalleryItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<IkarosGalleryItem>,
  ): Promise<IkarosGalleryItem | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async upsertRating(
    id: string,
    rating: GalleryRating,
  ): Promise<IkarosGalleryItem | null> {
    await this.model
      .findByIdAndUpdate(id, { $pull: { ratings: { userId: rating.userId } } })
      .exec();
    const withRating = await this.model
      .findByIdAndUpdate(id, { $push: { ratings: rating } }, { new: true })
      .lean()
      .exec();
    if (!withRating) return null;
    const entity = this.toEntity(
      withRating as unknown as Record<string, unknown>,
    );
    const avg =
      entity.ratings.length > 0
        ? Math.round(
            (entity.ratings.reduce((s, r) => s + r.stars, 0) /
              entity.ratings.length) *
              10,
          ) / 10
        : 0;
    const updated = await this.model
      .findByIdAndUpdate(id, { averageRating: avg }, { new: true })
      .lean()
      .exec();
    return updated
      ? this.toEntity(updated as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean().exec();
    return result !== null;
  }

  async countByCategory(category: string): Promise<number> {
    return this.model.countDocuments({ category }).exec();
  }

  async countPending(): Promise<number> {
    return this.model.countDocuments({ status: 'Pending' }).exec();
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments().exec();
  }

  async findPendingPaginated(
    offset: number,
    limit: number,
  ): Promise<IkarosGalleryItem[]> {
    const docs = await this.model
      .find({ status: 'Pending' })
      .sort({ createdAtUtc: -1 })
      .skip(offset)
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countByAuthorAndStatus(
    authorId: string,
  ): Promise<Record<GalleryStatus, number>> {
    const agg = await this.model.aggregate<{
      _id: GalleryStatus;
      count: number;
    }>([
      { $match: { authorId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const result: Record<GalleryStatus, number> = {
      Draft: 0,
      Pending: 0,
      Published: 0,
      Rejected: 0,
    };
    for (const item of agg) result[item._id] = item.count;
    return result;
  }
}
