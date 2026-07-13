/**
 * 21.5f — PriceListComment repository (jednoúrovňová diskuse ceníku).
 * Vzor: item-comments.repository, bez targetType/systemId.
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PriceListCommentDocument,
  PriceListCommentSchemaClass,
} from '../schemas/price-list-comment.schema';
import type { PriceListComment } from '../interfaces/price-list.interface';

@Injectable()
export class PriceListCommentsRepository {
  constructor(
    @InjectModel(PriceListCommentSchemaClass.name)
    private readonly model: Model<PriceListCommentDocument>,
  ) {}

  private toEntity(
    doc: PriceListCommentDocument | null,
  ): PriceListComment | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      priceListId: o.priceListId as string,
      authorId: o.authorId as string,
      authorName: o.authorName as string,
      content: o.content as string,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  /** Vlákno ceníku chronologicky; moderačně skryté komentáře vždy vynech. */
  async findByPriceList(priceListId: string): Promise<PriceListComment[]> {
    const docs = await this.model
      .find({ priceListId, moderationHidden: { $ne: true } })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async create(data: Partial<PriceListComment>): Promise<PriceListComment> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }
}
