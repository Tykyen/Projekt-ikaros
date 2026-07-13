/**
 * 21.5c — dvouúrovňová diskuse komunitního kouzla ('spell' = o kouzle/lore,
 * 'statblock' = balanc statů jednoho systému). Vzor: bestie-comments.service.
 * `authorName` = username z JWT (jako ikaros-discussions).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SpellCommentsRepository } from './repositories/spell-comments.repository';
import { SpellsRepository } from './repositories/spells.repository';
import type { CreateSpellCommentDto } from './dto/create-spell-comment.dto';
import type { SpellComment } from './interfaces/spell-comment.interface';

interface CommentAuthor {
  id: string;
  username: string;
}

@Injectable()
export class SpellCommentsService {
  constructor(
    private readonly repo: SpellCommentsRepository,
    private readonly spellsRepo: SpellsRepository,
  ) {}

  async list(
    spellId: string,
    targetType: 'spell' | 'statblock',
    systemId?: string,
  ): Promise<SpellComment[]> {
    return this.repo.findByTarget(spellId, targetType, systemId);
  }

  async create(
    spellId: string,
    dto: CreateSpellCommentDto,
    user: CommentAuthor,
  ): Promise<SpellComment> {
    const spell = await this.spellsRepo.findById(spellId);
    if (!spell) {
      throw new NotFoundException({
        code: 'SPELL_NOT_FOUND',
        message: 'Kouzlo nenalezeno.',
      });
    }
    if (dto.targetType === 'statblock' && !dto.systemId) {
      throw new BadRequestException(
        'systemId je povinné pro diskusi ke statům.',
      );
    }
    return this.repo.create({
      spellId,
      targetType: dto.targetType,
      systemId: dto.targetType === 'statblock' ? dto.systemId : undefined,
      authorId: user.id,
      authorName: user.username,
      content: dto.content,
    });
  }
}
