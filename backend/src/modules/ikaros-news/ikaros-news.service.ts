import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import type { IIkarosNewsRepository } from './interfaces/ikaros-news-repository.interface';
import type {
  IkarosNewsItem,
  IkarosNewsResponse,
} from './interfaces/ikaros-news.interface';
import type { CreateIkarosNewsDto } from './dto/create-ikaros-news.dto';
import { UserRole } from '../users/interfaces/user.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { PushService } from '../push/push.service';

@Injectable()
export class IkarosNewsService {
  private readonly logger = new Logger(IkarosNewsService.name);

  constructor(
    @Inject('IIkarosNewsRepository')
    private readonly repo: IIkarosNewsRepository,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
    private readonly pushService: PushService,
  ) {}

  private assertCanWrite(role: UserRole): void {
    if (role > UserRole.PJ)
      throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findAll(): Promise<IkarosNewsResponse[]> {
    const items = await this.repo.findActive();
    return this.joinAuthorNames(items);
  }

  async create(
    dto: CreateIkarosNewsDto,
    authorId: string,
    role: UserRole,
  ): Promise<IkarosNewsResponse> {
    this.assertCanWrite(role);
    const item = await this.repo.create({
      title: dto.title,
      content: dto.content,
      authorId,
      createdAtUtc: new Date(),
      isActive: true,
    });

    void this.pushService
      .notifyAll({
        title: 'Nová novinka na Ikarosu',
        body: item.title.slice(0, 100),
      })
      .catch((err: unknown) =>
        this.logger.warn('notifyAll selhal pro Ikaros novinku', err),
      );

    const [enriched] = await this.joinAuthorNames([item]);
    return enriched;
  }

  async delete(id: string, role: UserRole): Promise<void> {
    this.assertCanWrite(role);
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Novinka nenalezena');
  }

  /**
   * Pro každou novinku doplní `authorName` joinem z Users (1 query / unikátní authorId).
   * Smazaní/neexistující uživatelé fallback na legacy `authorName` z DB.
   */
  private async joinAuthorNames(
    items: IkarosNewsItem[],
  ): Promise<IkarosNewsResponse[]> {
    const uniqueIds = [...new Set(items.map((i) => i.authorId))];
    const usersById = new Map<string, string>();
    await Promise.all(
      uniqueIds.map(async (id) => {
        const user = await this.usersRepo.findById(id);
        if (user) usersById.set(id, user.username);
      }),
    );
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      authorId: item.authorId,
      authorName: usersById.get(item.authorId) ?? item.authorName ?? '',
      createdAtUtc: item.createdAtUtc,
      isActive: item.isActive,
    }));
  }
}
