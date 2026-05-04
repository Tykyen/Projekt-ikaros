import { Injectable, Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { IIkarosNewsRepository } from './interfaces/ikaros-news-repository.interface';
import type { IkarosNewsItem } from './interfaces/ikaros-news.interface';
import type { CreateIkarosNewsDto } from './dto/create-ikaros-news.dto';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class IkarosNewsService {
  constructor(
    @Inject('IIkarosNewsRepository') private readonly repo: IIkarosNewsRepository,
  ) {}

  private assertCanWrite(role: UserRole): void {
    if (role > UserRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findAll(): Promise<IkarosNewsItem[]> {
    return this.repo.findActive();
  }

  async create(
    dto: CreateIkarosNewsDto,
    authorId: string,
    authorName: string,
    role: UserRole,
  ): Promise<IkarosNewsItem> {
    this.assertCanWrite(role);
    return this.repo.create({
      title: dto.title,
      content: dto.content,
      authorId,
      authorName,
      createdAtUtc: new Date(),
      isActive: true,
    });
  }

  async delete(id: string, role: UserRole): Promise<void> {
    this.assertCanWrite(role);
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Novinka nenalezena');
  }
}
