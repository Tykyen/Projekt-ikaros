/**
 * 21.5f — PriceLists repository (ceníky, Mongo atomic ops). Vzor:
 * plants.repository — plus mapování vnořených položek (toItemEntity).
 * Field-drift checklist: schema ↔ DTO ↔ service ↔ toEntity (be_field_check).
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PriceListDocument,
  PriceListSchemaClass,
} from '../schemas/price-list.schema';
import type {
  PriceList,
  PriceListItem,
} from '../interfaces/price-list.interface';

export interface PriceListListFilter {
  status?: 'draft' | 'approved';
  tag?: string;
  /** true = zahrnout i moderačně skryté (jen pro Admin+ list). Default false. */
  includeHidden?: boolean;
  skip?: number;
  limit?: number;
}

@Injectable()
export class PriceListsRepository {
  constructor(
    @InjectModel(PriceListSchemaClass.name)
    private readonly model: Model<PriceListDocument>,
  ) {}

  private toItemEntity(raw: Record<string, unknown>): PriceListItem {
    return {
      id: raw.id as string,
      name: raw.name as string,
      description: raw.description as string | undefined,
      section: raw.section as string | undefined,
      imageUrl: raw.imageUrl as string | undefined,
      imageBytes: raw.imageBytes as number | undefined,
      imageFocalX: (raw.imageFocalX as number | null) ?? null,
      imageFocalY: (raw.imageFocalY as number | null) ?? null,
      imageZoom: (raw.imageZoom as number | null) ?? null,
      imageFit: (raw.imageFit as PriceListItem['imageFit']) ?? null,
      imageCredit: raw.imageCredit as string | undefined,
      gold: (raw.gold as number) ?? 0,
      silver: (raw.silver as number) ?? 0,
      copper: (raw.copper as number) ?? 0,
      linkedItemId: raw.linkedItemId as string | undefined,
    };
  }

  private toEntity(doc: PriceListDocument | null): PriceList | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      scope: 'community',
      name: o.name as string,
      description: (o.description as string) ?? '',
      imageUrl: o.imageUrl as string | undefined,
      imageBytes: o.imageBytes as number | undefined,
      imageFocalX: (o.imageFocalX as number | null) ?? null,
      imageFocalY: (o.imageFocalY as number | null) ?? null,
      imageZoom: (o.imageZoom as number | null) ?? null,
      imageFit: (o.imageFit as PriceList['imageFit']) ?? null,
      tags: o.tags as string[] | undefined,
      items: ((o.items as Record<string, unknown>[]) ?? []).map((it) =>
        this.toItemEntity(it),
      ),
      status: (o.status as PriceList['status']) ?? 'draft',
      authorId: o.authorId as string,
      approvedAt: (o.approvedAt as Date | null) ?? null,
      approvedBy: o.approvedBy as string | undefined,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  private buildQuery(filter: PriceListListFilter): Record<string, unknown> {
    const q: Record<string, unknown> = { scope: 'community' };
    // Moderačně skryté z listů vždy vynech (Admin+ list volitelně includeHidden).
    if (!filter.includeHidden) q.moderationHidden = { $ne: true };
    if (filter.status) q.status = filter.status;
    if (filter.tag) q.tags = filter.tag; // array-contains
    return q;
  }

  async findMany(filter: PriceListListFilter): Promise<PriceList[]> {
    let query = this.model
      .find(this.buildQuery(filter))
      .sort({ name: 1, _id: 1 });
    if (filter.skip) query = query.skip(filter.skip);
    if (filter.limit) query = query.limit(filter.limit);
    const docs = await query.exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async count(filter: PriceListListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async findById(id: string): Promise<PriceList | null> {
    const doc = await this.model.findById(id).exec();
    return this.toEntity(doc);
  }

  async create(data: Partial<PriceList>): Promise<PriceList> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }

  async update(
    id: string,
    patch: Partial<PriceList>,
  ): Promise<PriceList | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }

  async setStatus(
    id: string,
    status: 'draft' | 'approved',
    extra?: Partial<PriceList>,
  ): Promise<PriceList | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: { status, ...extra } }, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  async setModeration(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<PriceList | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            moderationHidden: hidden,
            moderationHiddenReason: hidden ? (reason ?? '') : '',
          },
        },
        { new: true },
      )
      .exec();
    return this.toEntity(doc);
  }
}
