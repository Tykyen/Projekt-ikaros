/**
 * 16.2b-2 — dvouúrovňová diskuse komunitní bestie. Čtení veřejné (community
 * bytost je veřejně objevitelná); psát smí přihlášený. `authorName` = username
 * z JWT (stejně jako ikaros-discussions).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BestieCommentsRepository } from './repositories/bestie-comments.repository';
import { BestiaeRepository } from './repositories/bestiae.repository';
import type { CreateBestieCommentDto } from './dto/create-bestie-comment.dto';
import type { BestieComment } from './interfaces/bestie-comment.interface';

interface CommentAuthor {
  id: string;
  username: string;
}

@Injectable()
export class BestieCommentsService {
  constructor(
    private readonly repo: BestieCommentsRepository,
    private readonly bestiaeRepo: BestiaeRepository,
  ) {}

  async list(
    bestieId: string,
    targetType: 'beast' | 'statblock',
    systemId?: string,
  ): Promise<BestieComment[]> {
    return this.repo.findByTarget(bestieId, targetType, systemId);
  }

  async create(
    bestieId: string,
    dto: CreateBestieCommentDto,
    user: CommentAuthor,
  ): Promise<BestieComment> {
    const bestie = await this.bestiaeRepo.findById(bestieId);
    if (!bestie || bestie.scope !== 'community') {
      throw new NotFoundException('Bestie nenalezena');
    }
    if (dto.targetType === 'statblock' && !dto.systemId) {
      throw new BadRequestException(
        'systemId je povinné pro diskusi ke statům.',
      );
    }
    return this.repo.create({
      bestieId,
      targetType: dto.targetType,
      systemId: dto.targetType === 'statblock' ? dto.systemId : undefined,
      authorId: user.id,
      authorName: user.username,
      content: dto.content,
    });
  }
}
