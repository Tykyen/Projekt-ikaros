import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IIkarosDiscussionsRepository } from './interfaces/ikaros-discussions-repository.interface';
import type { IIkarosDiscussionPostsRepository } from './interfaces/ikaros-discussion-posts-repository.interface';
import type { IkarosDiscussion, IkarosDiscussionPost } from './interfaces/ikaros-discussion.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateDiscussionDto } from './dto/create-discussion.dto';
import type { PatchDiscussionDto } from './dto/patch-discussion.dto';

const ADMIN_ROLES = [UserRole.Superadmin, UserRole.Admin, UserRole.PJ, UserRole.SpravceDisukzi];
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };

@Injectable()
export class IkarosDiscussionsService {
  constructor(
    @Inject('IIkarosDiscussionsRepository') private readonly repo: IIkarosDiscussionsRepository,
    @Inject('IIkarosDiscussionPostsRepository') private readonly postsRepo: IIkarosDiscussionPostsRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IkarosMessagesService') private readonly msgService: IkarosMessagesService,
  ) {}

  isAdmin(role: UserRole, username: string): boolean {
    return ADMIN_ROLES.includes(role) || username === 'Tyky';
  }

  private assertAdmin(role: UserRole, username: string): void {
    if (!this.isAdmin(role, username)) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  private isManagerOrAdmin(discussion: IkarosDiscussion, userId: string, role: UserRole, username: string): boolean {
    return discussion.managerIds.includes(userId) || this.isAdmin(role, username);
  }

  private canAccessDiscussion(discussion: IkarosDiscussion, userId: string, role: UserRole, username: string): boolean {
    if (this.isAdmin(role, username)) return true;
    if (!discussion.isApproved) return false;
    if (discussion.isOpen) return true;
    return (
      discussion.creatorId === userId ||
      discussion.managerIds.includes(userId) ||
      discussion.invitedUserIds.includes(userId)
    );
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    const tyky = await this.usersRepo.findByUsername('Tyky');
    const recipients = [...admins];
    if (tyky && !admins.some((a) => a.id === tyky.id)) recipients.push(tyky);
    await Promise.all(
      recipients.map((r) =>
        this.msgService.create({ recipientId: r.id, recipientName: r.username, subject, body }, SYSTEM_SENDER),
      ),
    );
  }

  private async notifyUser(recipientId: string, recipientName: string, subject: string, body: string): Promise<void> {
    await this.msgService.create({ recipientId, recipientName, subject, body }, SYSTEM_SENDER);
  }

  async findAll(userId: string, role: UserRole, username: string): Promise<IkarosDiscussion[]> {
    const all = await this.repo.findAll();
    return all.filter((d) => this.canAccessDiscussion(d, userId, role, username));
  }

  async findPending(role: UserRole, username: string): Promise<IkarosDiscussion[]> {
    this.assertAdmin(role, username);
    return this.repo.findPending();
  }

  async findMyFavorites(userId: string): Promise<IkarosDiscussion[]> {
    const user = await this.usersRepo.findById(userId);
    if (!user) return [];
    const ids = user.favoriteDiscussionIds ?? [];
    if (ids.length === 0) return [];
    return this.repo.findByIds(ids);
  }

  async findById(id: string, userId: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!this.canAccessDiscussion(discussion, userId, role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    return discussion;
  }

  async create(dto: CreateDiscussionDto, creatorId: string, creatorName: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    const isApproved = this.isAdmin(role, username);
    const discussion = await this.repo.create({
      title: dto.title,
      description: dto.description,
      bulletin: '',
      creatorId,
      creatorName,
      isApproved,
      isOpen: true,
      managerIds: [creatorId],
      invitedUserIds: [],
      postCount: 0,
      likeCount: 0,
      createdAtUtc: new Date(),
      lastActivityUtc: new Date(),
    });
    if (!isApproved) {
      await this.notifyAdmins('Nová diskuze čeká na schválení', `Uživatel ${creatorName} vytvořil novou diskuzi.`);
    }
    return discussion;
  }

  async patch(id: string, dto: PatchDiscussionDto, userId: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!this.isManagerOrAdmin(discussion, userId, role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    const updated = await this.repo.update(id, dto);
    return updated!;
  }

  async approve(id: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    this.assertAdmin(role, username);
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    const updated = await this.repo.update(id, { isApproved: true });
    await this.notifyUser(discussion.creatorId, discussion.creatorName, 'Vaše diskuze byla schválena', `Diskuze "${discussion.title}" byla schválena.`);
    return updated!;
  }

  async reject(id: string, reason: string | undefined, role: UserRole, username: string): Promise<void> {
    this.assertAdmin(role, username);
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    await this.postsRepo.deleteByDiscussion(id);
    await this.repo.delete(id);
    const body = reason ? `Důvod zamítnutí: ${reason}` : `Vaše diskuze "${discussion.title}" byla zamítnuta.`;
    await this.notifyUser(discussion.creatorId, discussion.creatorName, 'Vaše diskuze byla zamítnuta', body);
  }

  async invite(id: string, userId: string, invitedByUserId: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!this.isManagerOrAdmin(discussion, invitedByUserId, role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    if (discussion.invitedUserIds.includes(userId)) return discussion;
    const updated = await this.repo.update(id, { invitedUserIds: [...discussion.invitedUserIds, userId] });
    const invitedUser = await this.usersRepo.findById(userId);
    if (invitedUser) {
      await this.notifyUser(userId, invitedUser.username, 'Byl/a jsi pozván/a do diskuze', `Byl/a jsi pozván/a do diskuze "${discussion.title}".`);
    }
    return updated!;
  }

  async toggleFavorite(discussionId: string, userId: string): Promise<{ isFavorite: boolean }> {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const favorites = user.favoriteDiscussionIds ?? [];
    const isFavorite = favorites.includes(discussionId);
    const newFavorites = isFavorite
      ? favorites.filter((id) => id !== discussionId)
      : [...favorites, discussionId];
    await this.usersRepo.update(userId, { favoriteDiscussionIds: newFavorites });
    return { isFavorite: !isFavorite };
  }

  async getPosts(discussionId: string, userId: string, role: UserRole, username: string, skip = 0, limit = 50): Promise<IkarosDiscussionPost[]> {
    const discussion = await this.repo.findById(discussionId);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!this.canAccessDiscussion(discussion, userId, role, username)) throw new ForbiddenException('Přístup odepřen');
    return this.postsRepo.findByDiscussion(discussionId, skip, Math.min(limit, 100));
  }

  async addPost(discussionId: string, content: string, authorId: string, authorName: string): Promise<IkarosDiscussionPost> {
    const discussion = await this.repo.findById(discussionId);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!discussion.isApproved) throw new BadRequestException('Nelze přidat příspěvek do neschválené diskuze');
    const post = await this.postsRepo.create({
      discussionId,
      authorId,
      authorName,
      content,
      createdAtUtc: new Date(),
    });
    await this.repo.update(discussionId, {
      postCount: discussion.postCount + 1,
      lastActivityUtc: new Date(),
    });
    return post;
  }

  async deletePost(discussionId: string, postId: string, userId: string, role: UserRole, username: string): Promise<void> {
    const post = await this.postsRepo.findById(postId);
    if (!post) throw new NotFoundException('Příspěvek nenalezen');
    const discussion = await this.repo.findById(discussionId);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    const isAuthor = post.authorId === userId;
    const isManager = discussion.managerIds.includes(userId);
    if (!isAuthor && !isManager && !this.isAdmin(role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    await this.postsRepo.delete(postId);
    await this.repo.update(discussionId, { postCount: Math.max(0, discussion.postCount - 1) });
  }
}
