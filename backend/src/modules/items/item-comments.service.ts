/**
 * 21.5e — dvouúrovňová diskuse komunitního předmětu ('item' = o předmětu,
 * 'statblock' = balanc statů systému). Vzor: spell-comments.service (21.5c).
 * `authorName` = username z JWT.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemCommentsRepository } from './repositories/item-comments.repository';
import { ItemsRepository } from './repositories/items.repository';
import type { CreateItemCommentDto } from './dto/create-item-comment.dto';
import type { ItemComment } from './interfaces/item-comment.interface';

interface CommentAuthor {
  id: string;
  username: string;
}

@Injectable()
export class ItemCommentsService {
  constructor(
    private readonly repo: ItemCommentsRepository,
    private readonly itemsRepo: ItemsRepository,
  ) {}

  async list(
    itemId: string,
    targetType: 'item' | 'statblock',
    systemId?: string,
  ): Promise<ItemComment[]> {
    return this.repo.findByTarget(itemId, targetType, systemId);
  }

  async create(
    itemId: string,
    dto: CreateItemCommentDto,
    user: CommentAuthor,
  ): Promise<ItemComment> {
    const item = await this.itemsRepo.findById(itemId);
    if (!item) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        message: 'Předmět nenalezen.',
      });
    }
    if (dto.targetType === 'statblock' && !dto.systemId) {
      throw new BadRequestException(
        'systemId je povinné pro diskusi ke statům.',
      );
    }
    return this.repo.create({
      itemId,
      targetType: dto.targetType,
      systemId: dto.targetType === 'statblock' ? dto.systemId : undefined,
      authorId: user.id,
      authorName: user.username,
      content: dto.content,
    });
  }
}
