/**
 * 16.2b-2 — BestieComment repository (dvouúrovňová diskuse komunitní bestie).
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BestieCommentDocument,
  BestieCommentSchemaClass,
} from '../schemas/bestie-comment.schema';
import type { BestieComment } from '../interfaces/bestie-comment.interface';

@Injectable()
export class BestieCommentsRepository {
  constructor(
    @InjectModel(BestieCommentSchemaClass.name)
    private readonly model: Model<BestieCommentDocument>,
  ) {}

  private toEntity(doc: BestieCommentDocument | null): BestieComment | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      bestieId: o.bestieId as string,
      targetType: o.targetType as BestieComment['targetType'],
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
   * Vlákno jedné úrovně (bytost, nebo statblok daného systému), chronologicky.
   * Moderačně skryté komentáře vždy vynech.
   */
  async findByTarget(
    bestieId: string,
    targetType: 'beast' | 'statblock',
    systemId?: string,
  ): Promise<BestieComment[]> {
    const q: Record<string, unknown> = {
      bestieId,
      targetType,
      moderationHidden: { $ne: true },
    };
    if (targetType === 'statblock') q.systemId = systemId;
    const docs = await this.model.find(q).sort({ createdAt: 1 }).exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async create(data: Partial<BestieComment>): Promise<BestieComment> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }
}
