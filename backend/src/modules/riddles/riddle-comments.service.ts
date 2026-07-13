/**
 * 21.5d — jednoúrovňová diskuse komunitní hádanky. `authorName` = username
 * z JWT (jako ostatní knihovny).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { RiddleCommentsRepository } from './repositories/riddle-comments.repository';
import { RiddlesRepository } from './repositories/riddles.repository';
import type { CreateRiddleCommentDto } from './dto/create-riddle-comment.dto';
import type { RiddleComment } from './interfaces/riddle.interface';

interface CommentAuthor {
  id: string;
  username: string;
}

@Injectable()
export class RiddleCommentsService {
  constructor(
    private readonly repo: RiddleCommentsRepository,
    private readonly riddlesRepo: RiddlesRepository,
  ) {}

  async list(riddleId: string): Promise<RiddleComment[]> {
    return this.repo.findByRiddle(riddleId);
  }

  async create(
    riddleId: string,
    dto: CreateRiddleCommentDto,
    user: CommentAuthor,
  ): Promise<RiddleComment> {
    const riddle = await this.riddlesRepo.findById(riddleId);
    if (!riddle) {
      throw new NotFoundException({
        code: 'RIDDLE_NOT_FOUND',
        message: 'Hádanka nenalezena.',
      });
    }
    return this.repo.create({
      riddleId,
      authorId: user.id,
      authorName: user.username,
      content: dto.content,
    });
  }
}
