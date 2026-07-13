/**
 * 21.5c — SpellComment repository (dvouúrovňová diskuse komunitního kouzla).
 * Vzor: bestie-comments.repository.
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SpellCommentDocument,
  SpellCommentSchemaClass,
} from '../schemas/spell-comment.schema';
import type { SpellComment } from '../interfaces/spell-comment.interface';

@Injectable()
export class SpellCommentsRepository {
  constructor(
    @InjectModel(SpellCommentSchemaClass.name)
    private readonly model: Model<SpellCommentDocument>,
  ) {}

  private toEntity(doc: SpellCommentDocument | null): SpellComment | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      spellId: o.spellId as string,
      targetType: o.targetType as SpellComment['targetType'],
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
   * Vlákno jedné úrovně (kouzlo, nebo statblok daného systému), chronologicky.
   * Moderačně skryté komentáře vždy vynech.
   */
  async findByTarget(
    spellId: string,
    targetType: 'spell' | 'statblock',
    systemId?: string,
  ): Promise<SpellComment[]> {
    const q: Record<string, unknown> = {
      spellId,
      targetType,
      moderationHidden: { $ne: true },
    };
    if (targetType === 'statblock') q.systemId = systemId;
    const docs = await this.model.find(q).sort({ createdAt: 1 }).exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async create(data: Partial<SpellComment>): Promise<SpellComment> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }
}
