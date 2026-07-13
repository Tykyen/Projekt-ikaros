/**
 * 21.5b — PotionComment repository (dvouúrovňová diskuse komunitního lektvaru).
 * Vzor: spell-comments.repository (21.5c).
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PotionCommentDocument,
  PotionCommentSchemaClass,
} from '../schemas/potion-comment.schema';
import type { PotionComment } from '../interfaces/potion-comment.interface';

@Injectable()
export class PotionCommentsRepository {
  constructor(
    @InjectModel(PotionCommentSchemaClass.name)
    private readonly model: Model<PotionCommentDocument>,
  ) {}

  private toEntity(doc: PotionCommentDocument | null): PotionComment | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      potionId: o.potionId as string,
      targetType: o.targetType as PotionComment['targetType'],
      systemId: o.systemId as string | undefined,
      authorId: o.authorId as string,
      authorName: o.authorName as string,
      content: o.content as string,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  /**
   * Vlákno jedné úrovně (lektvar, nebo statblok daného systému), chronologicky.
   * Moderačně skryté komentáře vždy vynech.
   */
  async findByTarget(
    potionId: string,
    targetType: 'potion' | 'statblock',
    systemId?: string,
  ): Promise<PotionComment[]> {
    const q: Record<string, unknown> = {
      potionId,
      targetType,
      moderationHidden: { $ne: true },
    };
    if (targetType === 'statblock') q.systemId = systemId;
    const docs = await this.model.find(q).sort({ createdAt: 1 }).exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async create(data: Partial<PotionComment>): Promise<PotionComment> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }
}
