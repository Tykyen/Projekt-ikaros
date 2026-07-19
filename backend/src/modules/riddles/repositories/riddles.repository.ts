/**
 * 21.5d — Riddles repository (hádanky, Mongo atomic ops). Vzor:
 * plants.repository (community-only, bez statblocků) + filtr úrovně.
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RiddleDocument, RiddleSchemaClass } from '../schemas/riddle.schema';
import type { Riddle, RiddleDifficulty } from '../interfaces/riddle.interface';

export interface RiddleListFilter {
  status?: 'draft' | 'approved';
  difficulty?: RiddleDifficulty;
  tag?: string;
  /** true = zahrnout i moderačně skryté (jen pro Admin+ list). Default false. */
  includeHidden?: boolean;
  skip?: number;
  limit?: number;
}

@Injectable()
export class RiddlesRepository {
  constructor(
    @InjectModel(RiddleSchemaClass.name)
    private readonly model: Model<RiddleDocument>,
  ) {}

  private toEntity(doc: RiddleDocument | null): Riddle | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      scope: 'community',
      question: o.question as string,
      answer: o.answer as string,
      hints: (o.hints as string[]) ?? [],
      difficulty: o.difficulty as RiddleDifficulty,
      origin: o.origin as string | undefined,
      description: o.description as string | undefined,
      tags: o.tags as string[] | undefined,
      imageUrl: o.imageUrl as string | undefined,
      // D-19.2 — velikost blobu; staré dokumenty undefined.
      imageBytes: o.imageBytes as number | undefined,
      imageFocalX: (o.imageFocalX as number | null) ?? null,
      imageFocalY: (o.imageFocalY as number | null) ?? null,
      imageZoom: (o.imageZoom as number | null) ?? null,
      imageFit: (o.imageFit as Riddle['imageFit']) ?? null,
      status: (o.status as Riddle['status']) ?? 'draft',
      authorId: o.authorId as string,
      approvedAt: (o.approvedAt as Date | null) ?? null,
      approvedBy: o.approvedBy as string | undefined,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  private buildQuery(filter: RiddleListFilter): Record<string, unknown> {
    const q: Record<string, unknown> = { scope: 'community' };
    // Moderačně skryté z listů vždy vynech (Admin+ list volitelně includeHidden).
    if (!filter.includeHidden) q.moderationHidden = { $ne: true };
    if (filter.status) q.status = filter.status;
    if (filter.difficulty) q.difficulty = filter.difficulty;
    if (filter.tag) q.tags = filter.tag; // array-contains
    return q;
  }

  async findMany(filter: RiddleListFilter): Promise<Riddle[]> {
    let query = this.model
      .find(this.buildQuery(filter))
      // Hádanky nemají name → řadí dle zadání. D-NAMESORT: fold klíč z
      // `question` (jinak by „Č…" řadilo za ASCII). Stabilní tiebreak _id.
      .sort({ questionSort: 1, _id: 1 });
    if (filter.skip) query = query.skip(filter.skip);
    if (filter.limit) query = query.limit(filter.limit);
    const docs = await query.exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async count(filter: RiddleListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async findById(id: string): Promise<Riddle | null> {
    const doc = await this.model.findById(id).exec();
    return this.toEntity(doc);
  }

  async create(data: Partial<Riddle>): Promise<Riddle> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }

  async update(id: string, patch: Partial<Riddle>): Promise<Riddle | null> {
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
    extra?: Partial<Riddle>,
  ): Promise<Riddle | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: { status, ...extra } }, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  async setModeration(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<Riddle | null> {
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
