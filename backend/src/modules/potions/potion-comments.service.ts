/**
 * 21.5b — dvouúrovňová diskuse komunitního lektvaru ('potion' = o lektvaru,
 * 'statblock' = balanc statů systému). Vzor: spell-comments.service (21.5c).
 * `authorName` = username z JWT.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PotionCommentsRepository } from './repositories/potion-comments.repository';
import { PotionsRepository } from './repositories/potions.repository';
import type { CreatePotionCommentDto } from './dto/create-potion-comment.dto';
import type { PotionComment } from './interfaces/potion-comment.interface';

interface CommentAuthor {
  id: string;
  username: string;
}

@Injectable()
export class PotionCommentsService {
  constructor(
    private readonly repo: PotionCommentsRepository,
    private readonly potionsRepo: PotionsRepository,
  ) {}

  async list(
    potionId: string,
    targetType: 'potion' | 'statblock',
    systemId?: string,
  ): Promise<PotionComment[]> {
    return this.repo.findByTarget(potionId, targetType, systemId);
  }

  async create(
    potionId: string,
    dto: CreatePotionCommentDto,
    user: CommentAuthor,
  ): Promise<PotionComment> {
    const potion = await this.potionsRepo.findById(potionId);
    if (!potion) {
      throw new NotFoundException({
        code: 'POTION_NOT_FOUND',
        message: 'Lektvar nenalezen.',
      });
    }
    if (dto.targetType === 'statblock' && !dto.systemId) {
      throw new BadRequestException(
        'systemId je povinné pro diskusi ke statům.',
      );
    }
    return this.repo.create({
      potionId,
      targetType: dto.targetType,
      systemId: dto.targetType === 'statblock' ? dto.systemId : undefined,
      authorId: user.id,
      authorName: user.username,
      content: dto.content,
    });
  }
}
