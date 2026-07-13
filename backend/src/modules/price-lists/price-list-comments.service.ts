/**
 * 21.5f — jednoúrovňová diskuse ceníku (bez statblockové úrovně, R7).
 * Vzor: item-comments.service, zjednodušeno. `authorName` = username z JWT.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PriceListCommentsRepository } from './repositories/price-list-comments.repository';
import { PriceListsRepository } from './repositories/price-lists.repository';
import type { CreatePriceListCommentDto } from './dto/create-price-list-comment.dto';
import type { PriceListComment } from './interfaces/price-list.interface';

interface CommentAuthor {
  id: string;
  username: string;
}

@Injectable()
export class PriceListCommentsService {
  constructor(
    private readonly repo: PriceListCommentsRepository,
    private readonly priceListsRepo: PriceListsRepository,
  ) {}

  async list(priceListId: string): Promise<PriceListComment[]> {
    return this.repo.findByPriceList(priceListId);
  }

  async create(
    priceListId: string,
    dto: CreatePriceListCommentDto,
    user: CommentAuthor,
  ): Promise<PriceListComment> {
    const list = await this.priceListsRepo.findById(priceListId);
    if (!list) {
      throw new NotFoundException({
        code: 'PRICELIST_NOT_FOUND',
        message: 'Ceník nenalezen.',
      });
    }
    return this.repo.create({
      priceListId,
      authorId: user.id,
      authorName: user.username,
      content: dto.content,
    });
  }
}
