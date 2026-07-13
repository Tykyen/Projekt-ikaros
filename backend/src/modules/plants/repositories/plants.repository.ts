/**
 * 21.5a — Plants repository (herbář, Mongo atomic ops). Vzor: bestiae.repository
 * (community část), silně zjednodušeno — jen scope='community', bez statblocks
 * ops, bez soft-delete/clone/media helperů.
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlantDocument, PlantSchemaClass } from '../schemas/plant.schema';
import type { Plant, PlantRarity } from '../interfaces/plant.interface';

export interface PlantListFilter {
  status?: 'draft' | 'approved';
  rarity?: PlantRarity;
  tag?: string;
  /** true = zahrnout i moderačně skryté (jen pro Admin+ list). Default false. */
  includeHidden?: boolean;
  skip?: number;
  limit?: number;
}

@Injectable()
export class PlantsRepository {
  constructor(
    @InjectModel(PlantSchemaClass.name)
    private readonly model: Model<PlantDocument>,
  ) {}

  private toEntity(doc: PlantDocument | null): Plant | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      scope: 'community',
      name: o.name as string,
      aliases: o.aliases as string | undefined,
      imageUrl: o.imageUrl as string | undefined,
      // D-19.2 — velikost blobu; staré dokumenty undefined.
      imageBytes: o.imageBytes as number | undefined,
      imageFocalX: (o.imageFocalX as number | null) ?? null,
      imageFocalY: (o.imageFocalY as number | null) ?? null,
      imageZoom: (o.imageZoom as number | null) ?? null,
      imageFit: (o.imageFit as Plant['imageFit']) ?? null,
      habitat: o.habitat as string | undefined,
      usage: o.usage as string | undefined,
      rarity: o.rarity as PlantRarity | undefined,
      rarityNote: o.rarityNote as string | undefined,
      description: (o.description as string) ?? '',
      tags: o.tags as string[] | undefined,
      suggestedPrice: (o.suggestedPrice as number | null) ?? null,
      status: (o.status as Plant['status']) ?? 'draft',
      authorId: o.authorId as string,
      approvedAt: (o.approvedAt as Date | null) ?? null,
      approvedBy: o.approvedBy as string | undefined,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      statblocks: (o.statblocks as Record<string, unknown>) ?? {},
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  private buildQuery(filter: PlantListFilter): Record<string, unknown> {
    const q: Record<string, unknown> = { scope: 'community' };
    // Moderačně skryté z listů vždy vynech (Admin+ list volitelně includeHidden).
    if (!filter.includeHidden) q.moderationHidden = { $ne: true };
    if (filter.status) q.status = filter.status;
    if (filter.rarity) q.rarity = filter.rarity;
    if (filter.tag) q.tags = filter.tag; // array-contains
    return q;
  }

  async findMany(filter: PlantListFilter): Promise<Plant[]> {
    let query = this.model
      .find(this.buildQuery(filter))
      .sort({ name: 1, _id: 1 });
    if (filter.skip) query = query.skip(filter.skip);
    if (filter.limit) query = query.limit(filter.limit);
    const docs = await query.exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async count(filter: PlantListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async findById(id: string): Promise<Plant | null> {
    const doc = await this.model.findById(id).exec();
    return this.toEntity(doc);
  }

  async create(data: Partial<Plant>): Promise<Plant> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }

  async update(
    id: string,
    patch: Partial<Plant>,
    // D-072 — pole k vymazání ($unset); enum pole nejdou vyprázdnit přes $set.
    unset?: string[],
  ): Promise<Plant | null> {
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
    extra?: Partial<Plant>,
  ): Promise<Plant | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: { status, ...extra } }, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  async setModeration(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<Plant | null> {
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
