/**
 * 21.5e — ItemComment repository (dvouúrovňová diskuse komunitního předmětu).
 * Vzor: spell-comments.repository (21.5c).
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemCommentDocument,
  ItemCommentSchemaClass,
} from '../schemas/item-comment.schema';
import type { ItemComment } from '../interfaces/item-comment.interface';

@Injectable()
export class ItemCommentsRepository {
  constructor(
    @InjectModel(ItemCommentSchemaClass.name)
    private readonly model: Model<ItemCommentDocument>,
  ) {}

  private toEntity(doc: ItemCommentDocument | null): ItemComment | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      itemId: o.itemId as string,
      targetType: o.targetType as ItemComment['targetType'],
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
   * Vlákno jedné úrovně (předmět, nebo statblok daného systému), chronologicky.
   * Moderačně skryté komentáře vždy vynech.
   */
  async findByTarget(
    itemId: string,
    targetType: 'item' | 'statblock',
    systemId?: string,
  ): Promise<ItemComment[]> {
    const q: Record<string, unknown> = {
      itemId,
      targetType,
      moderationHidden: { $ne: true },
    };
    if (targetType === 'statblock') q.systemId = systemId;
    const docs = await this.model.find(q).sort({ createdAt: 1 }).exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async create(data: Partial<ItemComment>): Promise<ItemComment> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }
}
