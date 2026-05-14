import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { IIkarosArticlesRepository } from './interfaces/ikaros-articles-repository.interface';
import type { IkarosArticle } from './interfaces/ikaros-article.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateArticleDto } from './dto/create-article.dto';
import type { UpdateArticleDto } from './dto/update-article.dto';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';

const ADMIN_ROLES = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.PJ,
  UserRole.SpravceClankuu,
];
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };

@Injectable()
export class IkarosArticlesService {
  constructor(
    @Inject('IIkarosArticlesRepository')
    private readonly repo: IIkarosArticlesRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IkarosMessagesService')
    private readonly msgService: IkarosMessagesService,
  ) {}

  isAdmin(role: UserRole, username: string): boolean {
    return ADMIN_ROLES.includes(role) || username === 'Tyky';
  }

  private assertAdmin(role: UserRole, username: string): void {
    if (!this.isAdmin(role, username))
      throw new ForbiddenException('Nedostatečná oprávnění');
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    const tyky = await this.usersRepo.findByUsername('Tyky');
    const recipients = [...admins];
    if (tyky && !admins.some((a) => a.id === tyky.id)) recipients.push(tyky);
    await Promise.all(
      recipients.map((r) =>
        this.msgService.create(
          { recipientId: r.id, recipientName: r.username, subject, body },
          SYSTEM_SENDER,
        ),
      ),
    );
  }

  private async notifyUser(
    recipientId: string,
    recipientName: string,
    subject: string,
    body: string,
  ): Promise<void> {
    await this.msgService.create(
      { recipientId, recipientName, subject, body },
      SYSTEM_SENDER,
    );
  }

  async findAll(role: UserRole, username: string): Promise<IkarosArticle[]> {
    if (this.isAdmin(role, username))
      return this.repo.findPublishedAndPending();
    return this.repo.findPublished();
  }

  async findMy(authorId: string): Promise<IkarosArticle[]> {
    return this.repo.findByAuthor(authorId);
  }

  async findPending(
    role: UserRole,
    username: string,
  ): Promise<IkarosArticle[]> {
    this.assertAdmin(role, username);
    return this.repo.findPending();
  }

  async findStats(authorId: string): Promise<{
    draft: number;
    pending: number;
    published: number;
    rejected: number;
    totalRatings: number;
    averageRating: number;
  }> {
    const [counts, articles] = await Promise.all([
      this.repo.countByAuthorAndStatus(authorId),
      this.repo.findByAuthor(authorId),
    ]);
    const published = articles.filter((a) => a.status === 'Published');
    const totalRatings = published.reduce((s, a) => s + a.ratings.length, 0);
    const avgSum = published.reduce(
      (s, a) => s + a.averageRating * a.ratings.length,
      0,
    );
    const averageRating =
      totalRatings > 0 ? Math.round((avgSum / totalRatings) * 10) / 10 : 0;
    return {
      draft: counts.Draft,
      pending: counts.Pending,
      published: counts.Published,
      rejected: counts.Rejected,
      totalRatings,
      averageRating,
    };
  }

  async findById(
    id: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (
      article.status !== 'Published' &&
      article.authorId !== userId &&
      !this.isAdmin(role, username)
    ) {
      throw new ForbiddenException('Přístup odepřen');
    }
    return article;
  }

  async create(
    dto: CreateArticleDto,
    authorId: string,
    authorName: string,
    _role: UserRole,
  ): Promise<IkarosArticle> {
    const status = dto.submit ? 'Pending' : 'Draft';
    const article = await this.repo.create({
      title: dto.title,
      content: dto.content,
      category: (dto.category ?? 'Ostatni') as IkarosArticle['category'],
      authorId,
      authorName,
      status,
      ratings: [],
      averageRating: 0,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    if (status === 'Pending') {
      await this.notifyAdmins(
        'Článek čeká na schválení',
        `/ikaros/clanky/${article.id}`,
      );
    }
    return article;
  }

  async update(
    id: string,
    dto: UpdateArticleDto,
    userId: string,
    _role: UserRole,
    _username: string,
  ): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.authorId !== userId)
      throw new ForbiddenException('Přístup odepřen');
    if (article.status !== 'Draft' && article.status !== 'Rejected') {
      throw new BadRequestException(
        'Editovat lze jen Draft nebo Rejected článek',
      );
    }
    const updated = await this.repo.update(id, {
      ...dto,
      category: dto.category as IkarosArticle['category'] | undefined,
      updatedAtUtc: new Date(),
    });
    return updated!;
  }

  async delete(
    id: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<void> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    await this.repo.delete(id);
  }

  async submit(
    id: string,
    userId: string,
    _role: UserRole,
  ): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.authorId !== userId)
      throw new ForbiddenException('Přístup odepřen');
    if (article.status !== 'Draft' && article.status !== 'Rejected') {
      throw new BadRequestException(
        'Odeslat lze jen Draft nebo Rejected článek',
      );
    }
    const updated = await this.repo.update(id, {
      status: 'Pending',
      updatedAtUtc: new Date(),
    });
    await this.notifyAdmins('Článek čeká na schválení', `/ikaros/clanky/${id}`);
    return updated!;
  }

  async approve(
    id: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosArticle> {
    this.assertAdmin(role, username);
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.status !== 'Pending')
      throw new BadRequestException('Schválit lze jen Pending článek');
    const updated = await this.repo.update(id, {
      status: 'Published',
      publishedAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    await this.notifyUser(
      article.authorId,
      article.authorName,
      'Článek schválen',
      `Tvůj článek "${article.title}" byl schválen.`,
    );
    return updated!;
  }

  async reject(
    id: string,
    reason: string | undefined,
    role: UserRole,
    username: string,
  ): Promise<IkarosArticle> {
    this.assertAdmin(role, username);
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.status !== 'Pending')
      throw new BadRequestException('Zamítnout lze jen Pending článek');
    const updated = await this.repo.update(id, {
      status: 'Rejected',
      rejectReason: reason,
      updatedAtUtc: new Date(),
    });
    const body = reason
      ? `Důvod zamítnutí: ${reason}`
      : `Tvůj článek "${article.title}" byl zamítnut.`;
    await this.notifyUser(
      article.authorId,
      article.authorName,
      'Článek zamítnut',
      body,
    );
    return updated!;
  }

  async rate(
    id: string,
    stars: number,
    userId: string,
    _role: UserRole,
  ): Promise<{ averageRating: number; totalRatings: number }> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.status !== 'Published')
      throw new BadRequestException('Hodnotit lze jen Published článek');
    if (article.authorId === userId)
      throw new ForbiddenException('Autor nemůže hodnotit vlastní článek');
    const updated = await this.repo.upsertRating(id, { userId, stars });
    return {
      averageRating: updated?.averageRating ?? 0,
      totalRatings: updated?.ratings.length ?? 0,
    };
  }
}
