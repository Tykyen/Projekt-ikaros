/**
 * 21.5d — RiddleComment repository (jednoúrovňová diskuse hádanky).
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RiddleCommentDocument,
  RiddleCommentSchemaClass,
} from '../schemas/riddle-comment.schema';
import type { RiddleComment } from '../interfaces/riddle.interface';

@Injectable()
export class RiddleCommentsRepository {
  constructor(
    @InjectModel(RiddleCommentSchemaClass.name)
    private readonly model: Model<RiddleCommentDocument>,
  ) {}

  private toEntity(doc: RiddleCommentDocument | null): RiddleComment | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      riddleId: o.riddleId as string,
      authorId: o.authorId as string,
      authorName: o.authorName as string,
      content: o.content as string,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  /** Vlákno hádanky chronologicky; moderačně skryté vždy vynech. */
  async findByRiddle(riddleId: string): Promise<RiddleComment[]> {
    const docs = await this.model
      .find({ riddleId, moderationHidden: { $ne: true } })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async create(data: Partial<RiddleComment>): Promise<RiddleComment> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }
}
