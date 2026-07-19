/**
 * 21.2a — NameSets repository (Mongo atomic ops). Vzor: plants.repository.
 * Field-drift checklist: schema ↔ DTO ↔ service ↔ toEntity (be_field_check).
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NameSetDocument,
  NameSetSchemaClass,
} from '../schemas/name-set.schema';
import type {
  NameSet,
  NameSetCategory,
  NameSetDemography,
} from '../interfaces/name-set.interface';

export interface NameSetListFilter {
  status?: 'draft' | 'approved';
  category?: NameSetCategory;
  tag?: string;
  /** true = zahrnout i moderačně skryté (jen pro Admin+ list). Default false. */
  includeHidden?: boolean;
  skip?: number;
  limit?: number;
}

@Injectable()
export class NameSetsRepository {
  constructor(
    @InjectModel(NameSetSchemaClass.name)
    private readonly model: Model<NameSetDocument>,
  ) {}

  private toEntity(doc: NameSetDocument | null): NameSet | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      scope: 'community',
      name: o.name as string,
      category: o.category as NameSet['category'],
      description: o.description as string | undefined,
      surnameNote: o.surnameNote as string | undefined,
      tags: o.tags as string[] | undefined,
      maleNames: (o.maleNames as string[]) ?? [],
      femaleNames: (o.femaleNames as string[]) ?? [],
      surnames: (o.surnames as string[]) ?? [],
      epithets: (o.epithets as string[]) ?? [],
      femaleSurnameRule:
        (o.femaleSurnameRule as NameSet['femaleSurnameRule']) ?? 'none',
      frequencySorted: (o.frequencySorted as boolean | undefined) ?? false,
      demography: o.demography as NameSetDemography | undefined,
      status: (o.status as NameSet['status']) ?? 'draft',
      authorId: o.authorId as string,
      approvedAt: (o.approvedAt as Date | null) ?? null,
      approvedBy: o.approvedBy as string | undefined,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  private buildQuery(filter: NameSetListFilter): Record<string, unknown> {
    const q: Record<string, unknown> = { scope: 'community' };
    if (!filter.includeHidden) q.moderationHidden = { $ne: true };
    if (filter.status) q.status = filter.status;
    if (filter.category) q.category = filter.category;
    if (filter.tag) q.tags = filter.tag; // array-contains
    return q;
  }

  async findMany(filter: NameSetListFilter): Promise<NameSet[]> {
    let query = this.model
      .find(this.buildQuery(filter))
      // D-NAMESORT — v rámci kategorie řadí fold klíč (fold z `name`) místo
      // binárního `name`. Stabilní tiebreak _id.
      .sort({ category: 1, nameSort: 1, _id: 1 });
    if (filter.skip) query = query.skip(filter.skip);
    if (filter.limit) query = query.limit(filter.limit);
    const docs = await query.exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async count(filter: NameSetListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async findById(id: string): Promise<NameSet | null> {
    const doc = await this.model.findById(id).exec();
    return this.toEntity(doc);
  }

  async create(data: Partial<NameSet>): Promise<NameSet> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }

  async update(
    id: string,
    patch: Partial<NameSet>,
    unset?: string[],
  ): Promise<NameSet | null> {
    const update: Record<string, unknown> = { $set: patch };
    if (unset?.length)
      update.$unset = Object.fromEntries(unset.map((k) => [k, 1]));
    const doc = await this.model
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }

  async setStatus(
    id: string,
    status: 'draft' | 'approved',
    extra?: Partial<NameSet>,
  ): Promise<NameSet | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: { status, ...extra } }, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  async setModeration(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<NameSet | null> {
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
