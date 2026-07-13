import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  FindOptions,
  IIkarosNewsRepository,
  NewsScope,
  UpdateNewsFields,
} from '../interfaces/ikaros-news-repository.interface';
import type {
  IkarosNewsItem,
  IkarosNewsType,
} from '../interfaces/ikaros-news.interface';
import { IkarosNewsSchemaClass } from '../schemas/ikaros-news.schema';

@Injectable()
export class MongoIkarosNewsRepository implements IIkarosNewsRepository {
  constructor(
    @InjectModel(IkarosNewsSchemaClass.name)
    private readonly model: Model<IkarosNewsSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): IkarosNewsItem {
    return {
      id: String(doc._id),
      title: doc.title as string,
      content: doc.content as string,
      authorId: doc.authorId as string,
      authorName: (doc.authorName as string | undefined) ?? undefined,
      createdAtUtc: doc.createdAtUtc as Date,
      archived: (doc.archived as boolean | undefined) ?? false,
      archivedAtUtc: doc.archivedAtUtc as Date | undefined,
      archivedByUserId: doc.archivedByUserId as string | undefined,
      // Spec 3.1b — legacy dokumenty bez `type` se čtou jako 'info'.
      type: (doc.type as IkarosNewsType | undefined) ?? 'info',
      imageUrl: (doc.imageUrl as string | undefined) ?? undefined,
    };
  }

  /**
   * Spec 3.1 — filter podle archive scope.
   * - `active`   → `archived !== true` (kompatibilní s legacy dokumenty bez pole)
   * - `archived` → `archived === true`
   * - `all`      → bez filtru (vrátí všechno včetně archivovaného)
   *
   * Pozn.: D-065 odstranil legacy `isActive` filter z této vrstvy — pole už
   * není v schemě ani v entitách.
   */
  private buildFilter(scope: NewsScope): Record<string, unknown> {
    if (scope === 'active') return { archived: { $ne: true } };
    if (scope === 'archived') return { archived: true };
    return {};
  }

  async findByScope(opts?: FindOptions): Promise<IkarosNewsItem[]> {
    const scope = opts?.scope ?? 'active';
    let query = this.model
      .find(this.buildFilter(scope))
      .sort({ createdAtUtc: -1, _id: -1 });
    if (opts?.offset && opts.offset > 0) query = query.skip(opts.offset);
    if (opts?.limit && opts.limit > 0) query = query.limit(opts.limit);
    const docs = await query.lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countByScope(scope: NewsScope = 'active'): Promise<number> {
    return this.model.countDocuments(this.buildFilter(scope)).exec();
  }

  async findById(id: string): Promise<IkarosNewsItem | null> {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async create(data: Omit<IkarosNewsItem, 'id'>): Promise<IkarosNewsItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    dto: UpdateNewsFields,
  ): Promise<IkarosNewsItem | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async setArchived(
    id: string,
    archived: boolean,
    userId?: string,
  ): Promise<IkarosNewsItem | null> {
    const update = archived
      ? {
          $set: {
            archived: true,
            archivedAtUtc: new Date(),
            archivedByUserId: userId,
          },
        }
      : {
          $set: { archived: false },
          $unset: { archivedAtUtc: '', archivedByUserId: '' },
        };
    const doc = await this.model
      .findByIdAndUpdate(id, update, { new: true })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }
}
