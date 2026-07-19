/**
 * 21.5b — Potions repository (lektvary, Mongo atomic ops). Vzor:
 * spells.repository (21.5c) + filtr druhu (`kind`).
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PotionDocument, PotionSchemaClass } from '../schemas/potion.schema';
import type {
  Potion,
  PotionIngredient,
  PotionStatblockEntry,
} from '../interfaces/potion.interface';

export interface PotionListFilter {
  status?: 'draft' | 'approved';
  /** Filtr: lektvar má statblok pro daný systém (ne jen primární systém). */
  systemId?: string;
  kind?: string;
  tag?: string;
  /** true = zahrnout i moderačně skryté (jen pro Admin+ list). Default false. */
  includeHidden?: boolean;
  skip?: number;
  limit?: number;
}

@Injectable()
export class PotionsRepository {
  constructor(
    @InjectModel(PotionSchemaClass.name)
    private readonly model: Model<PotionDocument>,
  ) {}

  private toEntity(doc: PotionDocument | null): Potion | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      scope: 'community',
      systemId: o.systemId as string,
      name: o.name as string,
      aliases: o.aliases as string | undefined,
      imageUrl: o.imageUrl as string | undefined,
      // D-19.2 — velikost blobu; staré dokumenty undefined.
      imageBytes: o.imageBytes as number | undefined,
      imageFocalX: (o.imageFocalX as number | null) ?? null,
      imageFocalY: (o.imageFocalY as number | null) ?? null,
      imageZoom: (o.imageZoom as number | null) ?? null,
      imageFit: (o.imageFit as Potion['imageFit']) ?? null,
      kind: (o.kind as string) ?? '',
      ingredients: (o.ingredients as PotionIngredient[]) ?? [],
      description: (o.description as string) ?? '',
      tags: o.tags as string[] | undefined,
      suggestedPrice: (o.suggestedPrice as number | null) ?? null,
      status: (o.status as Potion['status']) ?? 'draft',
      authorId: o.authorId as string,
      approvedAt: (o.approvedAt as Date | null) ?? null,
      approvedBy: o.approvedBy as string | undefined,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      statblocks: (o.statblocks as Record<string, PotionStatblockEntry>) ?? {},
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  private buildQuery(filter: PotionListFilter): Record<string, unknown> {
    const q: Record<string, unknown> = { scope: 'community' };
    // Moderačně skryté z listů vždy vynech (Admin+ list volitelně includeHidden).
    if (!filter.includeHidden) q.moderationHidden = { $ne: true };
    if (filter.status) q.status = filter.status;
    // Lektvar „patří" systému, když má jeho statblok (i navržený později).
    if (filter.systemId) q[`statblocks.${filter.systemId}`] = { $exists: true };
    if (filter.kind) q.kind = filter.kind;
    if (filter.tag) q.tags = filter.tag; // array-contains
    return q;
  }

  async findMany(filter: PotionListFilter): Promise<Potion[]> {
    let query = this.model
      .find(this.buildQuery(filter))
      // D-NAMESORT — řadicí klíč (fold z `name`) místo binárního `name`.
      .sort({ nameSort: 1, _id: 1 });
    if (filter.skip) query = query.skip(filter.skip);
    if (filter.limit) query = query.limit(filter.limit);
    const docs = await query.exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async count(filter: PotionListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async findById(id: string): Promise<Potion | null> {
    const doc = await this.model.findById(id).exec();
    return this.toEntity(doc);
  }

  async create(data: Partial<Potion>): Promise<Potion> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }

  async update(id: string, patch: Partial<Potion>): Promise<Potion | null> {
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
    extra?: Partial<Potion>,
  ): Promise<Potion | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: { status, ...extra } }, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  /** Upsert jedné pravidlové verze (vzor spells.setStatblock). */
  async setStatblock(
    id: string,
    systemId: string,
    entry: PotionStatblockEntry,
  ): Promise<Potion | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { [`statblocks.${systemId}`]: entry } },
        { new: true },
      )
      .exec();
    return this.toEntity(doc);
  }

  /** Schválení jedné pravidlové verze (draft → approved = balancnuté). */
  async setStatblockStatus(
    id: string,
    systemId: string,
    status: 'draft' | 'approved',
  ): Promise<Potion | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { [`statblocks.${systemId}.status`]: status } },
        { new: true },
      )
      .exec();
    return this.toEntity(doc);
  }

  async setModeration(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<Potion | null> {
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
