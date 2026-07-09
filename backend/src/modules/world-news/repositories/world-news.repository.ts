import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import type {
  IWorldNewsRepository,
  FindOptions,
  CountOptions,
} from '../interfaces/world-news-repository.interface';
import type {
  WorldNewsItem,
  WorldNewsType,
  WorldNewsScope,
} from '../interfaces/world-news.interface';
import { WorldNewsSchemaClass } from '../schemas/world-news.schema';

@Injectable()
export class MongoWorldNewsRepository implements IWorldNewsRepository {
  constructor(
    @InjectModel(WorldNewsSchemaClass.name)
    private readonly model: Model<WorldNewsSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): WorldNewsItem {
    return {
      id: String(doc._id),
      worldId: (doc.worldId as string | null) ?? null,
      title: doc.title as string,
      content: doc.content as string,
      date: doc.date as string,
      type: doc.type as WorldNewsType,
      link: doc.link as string | undefined,
      linkPageSlug: (doc.linkPageSlug as string | null) ?? null,
      imageUrl: (doc.imageUrl as string | null) ?? null,
      imageFocalX: (doc.imageFocalX as number | null) ?? null,
      imageFocalY: (doc.imageFocalY as number | null) ?? null,
      imageZoom: (doc.imageZoom as number | null) ?? null,
      imageFit: (doc.imageFit as 'cover' | 'contain' | null) ?? null,
      calendarConfigId: (doc.calendarConfigId as string | null) ?? null,
      calendarDate:
        (doc.calendarDate as WorldNewsItem['calendarDate'] | undefined) ?? null,
      createdBy: doc.createdBy as string | undefined,
      archived: (doc.archived as boolean | undefined) ?? false,
      moderationHidden: (doc.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: doc.moderationHiddenReason as string | undefined,
    };
  }

  /** Scope → mongo filtr. Legacy dokumenty bez `archived` = aktivní. */
  private scopeFilter(scope: WorldNewsScope): Record<string, unknown> {
    if (scope === 'archived') return { archived: true };
    if (scope === 'all') return {};
    return { archived: { $ne: true } };
  }

  private buildFilter(
    worldId: string | undefined,
    scope: WorldNewsScope,
  ): Record<string, unknown> {
    // FIX-22b — bez `worldId` smí projít jen GLOBÁLNÍ novinky (worldId=null),
    // ne celá kolekce. Dřív `{}` (žádný filtr) vracel i novinky privátních
    // světů komukoli, kdo zavolal `GET /world-news` bez query parametru
    // (service gate `assertCanReadScope` pro `scope=active` bez worldId
    // taky nic nekontroluje — viz FIX-22 komentář tamtéž).
    const worldFilter =
      worldId === undefined
        ? { worldId: null }
        : { worldId: { $in: [worldId, null] } };
    // B5 — moderačně skryté novinky (M2/M3) z veřejných listů vždy vynech
    // (jako `ikaros-articles`). Reviewer je dohledá přes moderační log / detail.
    return {
      ...worldFilter,
      ...this.scopeFilter(scope),
      moderationHidden: { $ne: true },
    };
  }

  async findMany(opts: FindOptions): Promise<WorldNewsItem[]> {
    const filter = this.buildFilter(opts.worldId, opts.scope ?? 'active');
    const docs = await this.model
      .find(filter)
      .sort({ date: -1 })
      .skip(opts.offset ?? 0)
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async count(opts: CountOptions): Promise<number> {
    const filter = this.buildFilter(opts.worldId, opts.scope ?? 'active');
    return this.model.countDocuments(filter).exec();
  }

  async findById(id: string): Promise<WorldNewsItem | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async create(data: Omit<WorldNewsItem, 'id'>): Promise<WorldNewsItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    patch: Partial<Omit<WorldNewsItem, 'id' | 'worldId'>>,
  ): Promise<WorldNewsItem | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async setArchived(
    id: string,
    archived: boolean,
    userId: string,
  ): Promise<WorldNewsItem | null> {
    if (!isValidObjectId(id)) return null;
    // Unarchive vyčistí audit pole přes $unset (undefined v patch by se ignorovalo).
    const patch = archived
      ? { archived: true, archivedAtUtc: new Date(), archivedByUserId: userId }
      : { archived: false, $unset: { archivedAtUtc: 1, archivedByUserId: 1 } };
    const doc = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }
}
