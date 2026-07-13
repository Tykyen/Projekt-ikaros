import {
  Injectable,
  Inject,
  Optional,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';
import { logWarn } from '../../common/logging/log-error.util';
import { PushService } from '../push/push.service';
import type { IIkarosDiscussionsRepository } from './interfaces/ikaros-discussions-repository.interface';
import type { IIkarosDiscussionPostsRepository } from './interfaces/ikaros-discussion-posts-repository.interface';
import type {
  IkarosDiscussion,
  IkarosDiscussionPost,
} from './interfaces/ikaros-discussion.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { UsersService } from '../users/users.service';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { UserRole } from '../users/interfaces/user.interface';
import {
  MAX_PINNED,
  toggleFavoriteId,
  togglePinnedId,
} from '../users/favorites-toggle.util';
import type { CreateDiscussionDto } from './dto/create-discussion.dto';
import type { PatchDiscussionDto } from './dto/patch-discussion.dto';
import { assertUnderCreationLimit } from '../../common/limits/creation-limits';

// 3.4 — diskuze je platformový obsah → bez world-scoped PJ (memory pravidlo).
const ADMIN_ROLES = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceDiskuzi,
];
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };
// 3.7 — favorites/pin toggle sdílený helper (D-NEW-INV-CLEANUP)
const FAVORITE_FIELDS = {
  favorites: 'favoriteDiscussionIds',
  pinned: 'pinnedDiscussionIds',
} as const;

@Injectable()
export class IkarosDiscussionsService {
  constructor(
    @Inject('IIkarosDiscussionsRepository')
    private readonly repo: IIkarosDiscussionsRepository,
    @Inject('IIkarosDiscussionPostsRepository')
    private readonly postsRepo: IIkarosDiscussionPostsRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    // D-040 — tombstone batch enrich pro `creatorIsDeleted` / `authorIsDeleted`.
    private readonly usersService: UsersService,
    @Inject('IkarosMessagesService')
    private readonly msgService: IkarosMessagesService,
    // 15.9 — push autorovi diskuse; @Optional pro starší testy bez PushModule.
    @Optional()
    private readonly pushService?: PushService,
  ) {}

  private readonly logger = new Logger(IkarosDiscussionsService.name);

  /** D-040 — batch enrich creatorIsDeleted na diskuze. */
  private async enrichTombstoneCreators(
    discussions: IkarosDiscussion[],
  ): Promise<IkarosDiscussion[]> {
    if (discussions.length === 0) return discussions;
    const ids = Array.from(new Set(discussions.map((d) => d.creatorId)));
    const info = await this.usersService.findManyTombstoneInfo(ids);
    return discussions.map((d) => ({
      ...d,
      creatorIsDeleted: info.get(d.creatorId)?.isDeleted ?? false,
    }));
  }

  /** D-040 — single-discussion variant. */
  private async enrichTombstoneCreator(
    discussion: IkarosDiscussion,
  ): Promise<IkarosDiscussion> {
    const info = await this.usersService.findManyTombstoneInfo([
      discussion.creatorId,
    ]);
    return {
      ...discussion,
      creatorIsDeleted: info.get(discussion.creatorId)?.isDeleted ?? false,
    };
  }

  /** D-040 — batch enrich authorIsDeleted na posts. */
  private async enrichTombstoneAuthors(
    posts: IkarosDiscussionPost[],
  ): Promise<IkarosDiscussionPost[]> {
    if (posts.length === 0) return posts;
    const ids = Array.from(new Set(posts.map((p) => p.authorId)));
    const info = await this.usersService.findManyTombstoneInfo(ids);
    return posts.map((p) => ({
      ...p,
      authorIsDeleted: info.get(p.authorId)?.isDeleted ?? false,
    }));
  }

  // R-RUN-03 (plný audit 2026-06-20) — odstraněn `username === 'Tyky'` backdoor
  // (rename-útok); Tyky má plnou moc přes roli Superadmin v ADMIN_ROLES.
  isAdmin(role: UserRole, _username?: string): boolean {
    return ADMIN_ROLES.includes(role);
  }

  private assertAdmin(role: UserRole, username: string): void {
    if (!this.isAdmin(role, username))
      throw new ForbiddenException({
        code: 'DISCUSSION_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
  }

  private isManagerOrAdmin(
    discussion: IkarosDiscussion,
    userId: string,
    role: UserRole,
    username: string,
  ): boolean {
    return (
      discussion.managerIds.includes(userId) || this.isAdmin(role, username)
    );
  }

  private canAccessDiscussion(
    discussion: IkarosDiscussion,
    userId: string,
    role: UserRole,
    username: string,
  ): boolean {
    if (this.isAdmin(role, username)) return true;
    // FIX-64 — dřív `!isApproved` rovnou vrátilo false bez ohledu na
    // creatorId/managerIds → tvůrce dostal 403 na VLASTNÍ pending diskuzi
    // (nemohl sledovat stav schvalování ani ji upravit před schválením).
    if (!discussion.isApproved) {
      return (
        discussion.creatorId === userId ||
        discussion.managerIds.includes(userId)
      );
    }
    if (discussion.isOpen) return true;
    return (
      discussion.creatorId === userId ||
      discussion.managerIds.includes(userId) ||
      discussion.invitedUserIds.includes(userId)
    );
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    // D-NEW-INV-CLEANUP — Tyky je primární Superadmin ∈ ADMIN_ROLES, takže už je
    // v `admins`; hardcoded `findByUsername('Tyky')` fallback byl redundantní
    // (rename-útok řeší role, ne jméno — viz isAdmin R-RUN-03).
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    await Promise.all(
      admins.map((r) =>
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

  private async notifyManagers(
    discussion: IkarosDiscussion,
    subject: string,
    body: string,
  ): Promise<void> {
    await Promise.all(
      discussion.managerIds.map(async (managerId) => {
        const manager = await this.usersRepo.findById(managerId);
        if (manager)
          await this.notifyUser(managerId, manager.username, subject, body);
      }),
    );
  }

  private assertCreatorOrAdmin(
    discussion: IkarosDiscussion,
    userId: string,
    role: UserRole,
    username: string,
  ): void {
    if (discussion.creatorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
  }

  async findAll(
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion[]> {
    const all = await this.repo.findAll();
    const filtered = all.filter((d) =>
      this.canAccessDiscussion(d, userId, role, username),
    );
    return this.enrichTombstoneCreators(filtered);
  }

  /**
   * D-NEW-discussion-pagination — paged variant. `limit`/`offset` jsou
   * sanitované v controlleru. Access filter (canAccessDiscussion) běží
   * post-fetch — pro velmi velký dataset by vyžadovalo Mongo $expr,
   * pro teď je client-side pro N×stovky OK.
   */
  async findAllPaginated(
    userId: string,
    role: UserRole,
    username: string,
    offset: number,
    limit: number,
  ): Promise<{ items: IkarosDiscussion[]; total: number }> {
    // N-12 — access filter běží post-fetch, takže paginujeme až PO filtru.
    // Dřív se bral `total` z DB countu (všechny diskuze), ale `items` byly
    // odfiltrované → FE ukazoval špatný počet stránek (poslední byly prázdné).
    // Load-all + in-memory je v pořádku pro N×stovky (viz pozn. u metody);
    // sort replikuje `lastActivityUtc desc` z repo.findAllPaginated.
    const all = await this.repo.findAll();
    const accessible = all
      .filter((d) => this.canAccessDiscussion(d, userId, role, username))
      .sort(
        (a, b) =>
          (b.lastActivityUtc?.getTime() ?? 0) -
          (a.lastActivityUtc?.getTime() ?? 0),
      );
    const total = accessible.length;
    const page = accessible.slice(offset, offset + limit);
    const enriched = await this.enrichTombstoneCreators(page);
    return { items: enriched, total };
  }

  /**
   * D-DROBNE — všechny diskuze tvůrce vč. pending/uzamčených (zrcadlo
   * `findMy` v ikaros-articles/gallery; profil „Moje diskuze"). Tvůrce má na
   * vlastní diskuzi vždy přístup (viz canAccessDiscussion/FIX-64), takže
   * access filtr netřeba — repo filtruje výhradně dle `creatorId`.
   */
  async findMy(userId: string): Promise<IkarosDiscussion[]> {
    const discussions = await this.repo.findByCreator(userId);
    return this.enrichTombstoneCreators(discussions);
  }

  async findPending(
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion[]> {
    this.assertAdmin(role, username);
    const pending = await this.repo.findPending();
    return this.enrichTombstoneCreators(pending);
  }

  async findMyFavorites(userId: string): Promise<IkarosDiscussion[]> {
    const user = await this.usersRepo.findById(userId);
    if (!user) return [];
    const ids = user.favoriteDiscussionIds ?? [];
    if (ids.length === 0) return [];
    const discussions = await this.repo.findByIds(ids);
    // FIX-9 (leak fix, vzor findById/findAll) — dřív žádný access filtr,
    // takže přes toggle-favorite šlo číst cizí neschválené/uzavřené diskuze.
    const visible = discussions.filter((d) =>
      this.canAccessDiscussion(d, userId, user.role, user.username),
    );
    return this.enrichTombstoneCreators(visible);
  }

  async findById(
    id: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    if (!this.canAccessDiscussion(discussion, userId, role, username)) {
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    return this.enrichTombstoneCreator(discussion);
  }

  async create(
    dto: CreateDiscussionDto,
    creatorId: string,
    creatorName: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion> {
    // D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: kumulativní strop
    // diskuzí per účet.
    assertUnderCreationLimit(
      await this.repo.countByCreator(creatorId),
      'MAX_DISCUSSIONS_PER_USER',
      'diskuzí na účet',
    );
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
      joinRequestIds: [],
      postCount: 0,
      likeCount: 0,
      createdAtUtc: new Date(),
      lastActivityUtc: new Date(),
    });
    if (!isApproved) {
      await this.notifyAdmins(
        'Nová diskuze čeká na schválení',
        `Uživatel ${creatorName} vytvořil novou diskuzi.`,
      );
    }
    return discussion;
  }

  async patch(
    id: string,
    dto: PatchDiscussionDto,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    if (!this.isManagerOrAdmin(discussion, userId, role, username)) {
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    const updated = await this.repo.update(id, dto);
    return updated!;
  }

  async approve(
    id: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion> {
    this.assertAdmin(role, username);
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    const updated = await this.repo.update(id, { isApproved: true });
    await this.notifyUser(
      discussion.creatorId,
      discussion.creatorName,
      'Vaše diskuze byla schválena',
      `Diskuze "${discussion.title}" byla schválena.`,
    );
    return updated!;
  }

  async reject(
    id: string,
    reason: string | undefined,
    role: UserRole,
    username: string,
  ): Promise<void> {
    this.assertAdmin(role, username);
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    // FIX-65 — `reject` je hard-delete. Bez tohoto guardu šlo „zamítnout"
    // (= smazat) i živou, už schválenou diskuzi — reject smí cílit jen na
    // dosud NEschválenou (pending) diskuzi.
    if (discussion.isApproved) {
      throw new BadRequestException({
        code: 'DISCUSSION_ALREADY_APPROVED',
        message:
          'Diskuze je už schválená — zamítnutí lze použít jen na čekající (neschválenou) diskuzi.',
      });
    }
    await this.postsRepo.deleteByDiscussion(id);
    await this.repo.delete(id);
    const body = reason
      ? `Důvod zamítnutí: ${reason}`
      : `Vaše diskuze "${discussion.title}" byla zamítnuta.`;
    await this.notifyUser(
      discussion.creatorId,
      discussion.creatorName,
      'Vaše diskuze byla zamítnuta',
      body,
    );
  }

  async invite(
    id: string,
    userId: string,
    invitedByUserId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    if (!this.isManagerOrAdmin(discussion, invitedByUserId, role, username)) {
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    if (discussion.invitedUserIds.includes(userId)) return discussion;
    const updated = await this.repo.update(id, {
      invitedUserIds: [...discussion.invitedUserIds, userId],
    });
    const invitedUser = await this.usersRepo.findById(userId);
    if (invitedUser) {
      await this.notifyUser(
        userId,
        invitedUser.username,
        'Byl/a jsi pozván/a do diskuze',
        `Byl/a jsi pozván/a do diskuze "${discussion.title}".`,
      );
    }
    return updated!;
  }

  /** Existence check pro favorites/pin toggle (sdílený helper; FIX-9). */
  private async requireDiscussionExists(discussionId: string): Promise<void> {
    const discussion = await this.repo.findById(discussionId);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
  }

  async toggleFavorite(
    discussionId: string,
    userId: string,
  ): Promise<{ isFavorite: boolean }> {
    return toggleFavoriteId({
      usersRepo: this.usersRepo,
      userId,
      itemId: discussionId,
      fields: FAVORITE_FIELDS,
      ensureItemExists: () => this.requireDiscussionExists(discussionId),
    });
  }

  // 3.7 — připnutí diskuze do sidebaru; max 5, jen oblíbenou
  async togglePin(
    discussionId: string,
    userId: string,
  ): Promise<{ isPinned: boolean }> {
    return togglePinnedId({
      usersRepo: this.usersRepo,
      userId,
      itemId: discussionId,
      fields: FAVORITE_FIELDS,
      ensureItemExists: () => this.requireDiscussionExists(discussionId),
      messages: {
        notFavorite: 'Připnout lze jen oblíbenou diskuzi',
        pinLimit: `Připnout lze max ${MAX_PINNED} diskuzí`,
      },
    });
  }

  async getPosts(
    discussionId: string,
    userId: string,
    role: UserRole,
    username: string,
    skip = 0,
    limit = 50,
  ): Promise<IkarosDiscussionPost[]> {
    const discussion = await this.repo.findById(discussionId);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    if (!this.canAccessDiscussion(discussion, userId, role, username))
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    // B4d — moderačně skryté příspěvky (M2/M3) vidí jen reviewer set
    // (Superadmin/Admin/SpravceDiskuzi); ostatním se z vlákna vynechají.
    const isReviewer = this.isAdmin(role, username);
    const posts = await this.postsRepo.findByDiscussion(
      discussionId,
      skip,
      Math.min(limit, 100),
      isReviewer,
    );
    return this.enrichTombstoneAuthors(posts);
  }

  async addPost(
    discussionId: string,
    content: string,
    authorId: string,
    authorName: string,
    role: UserRole,
  ): Promise<IkarosDiscussionPost> {
    const discussion = await this.repo.findById(discussionId);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    if (!discussion.isApproved)
      throw new BadRequestException(
        'Nelze přidat příspěvek do neschválené diskuze',
      );
    // N-RUN-01 / R-RUN-01 (plný audit 2026-06-20) — addPost minul access gate,
    // který getPosts a findById mají → nepozvaný uživatel mohl psát do uzavřené
    // (neveřejné) schválené diskuze, znal-li ID.
    if (!this.canAccessDiscussion(discussion, authorId, role, authorName))
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    // D-NEW-html-sanitization (2026-05-21) — sanitize TipTap output před uložením.
    const post = await this.postsRepo.create({
      discussionId,
      authorId,
      authorName,
      content: sanitizeRichText(content),
      createdAtUtc: new Date(),
    });
    await this.repo.adjustPostCount(discussionId, 1, true);
    // 15.9 — push autorovi diskuse o novém příspěvku (ne když píše sám autor).
    // Kategorie `ownDiscussion`. fire-and-forget.
    if (discussion.creatorId !== authorId) {
      void this.pushService
        ?.notify(
          discussion.creatorId,
          {
            title: 'Nový příspěvek ve tvé diskusi',
            body: `${authorName} přispěl do „${discussion.title}“`.slice(
              0,
              120,
            ),
            url: `/ikaros/diskuze/${discussion.id}`,
          },
          'ownDiscussion',
        )
        .catch((err: unknown) =>
          logWarn(this.logger, 'push selhal pro discussion post', err),
        );
    }
    return post;
  }

  async deletePost(
    discussionId: string,
    postId: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<void> {
    const post = await this.postsRepo.findById(postId);
    if (!post)
      throw new NotFoundException({
        code: 'POST_NOT_FOUND',
        message: 'Příspěvek nenalezen',
      });
    const discussion = await this.repo.findById(discussionId);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    const isAuthor = post.authorId === userId;
    const isManager = discussion.managerIds.includes(userId);
    if (!isAuthor && !isManager && !this.isAdmin(role, username)) {
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    await this.postsRepo.delete(postId);
    await this.repo.adjustPostCount(discussionId, -1);
  }

  // ─── 3.4 — like, manažeři, žádosti o přidání, reporty ──────────────────

  /** Resolvované seznamy členů diskuze — pro manage panel. Jen manažer/admin. */
  async getMembers(
    id: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<{
    managers: Array<{ id: string; username: string }>;
    invited: Array<{ id: string; username: string }>;
    joinRequests: Array<{ id: string; username: string }>;
  }> {
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    if (!this.isManagerOrAdmin(discussion, userId, role, username))
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    const resolve = (
      ids: string[],
    ): Promise<Array<{ id: string; username: string }>> =>
      Promise.all(
        ids.map(async (uid) => {
          const u = await this.usersRepo.findById(uid);
          return { id: uid, username: u?.username ?? 'Neznámý uživatel' };
        }),
      );
    const [managers, invited, joinRequests] = await Promise.all([
      resolve(discussion.managerIds),
      resolve(discussion.invitedUserIds),
      resolve(discussion.joinRequestIds),
    ]);
    return { managers, invited, joinRequests };
  }

  async toggleLike(
    discussionId: string,
    userId: string,
  ): Promise<{ isLiked: boolean; likeCount: number }> {
    const discussion = await this.repo.findById(discussionId);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    const user = await this.usersRepo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    const liked = user.likedDiscussionIds ?? [];
    const isLiked = liked.includes(discussionId);
    const newLiked = isLiked
      ? liked.filter((id) => id !== discussionId)
      : [...liked, discussionId];
    await this.usersRepo.update(userId, { likedDiscussionIds: newLiked });
    const updated = await this.repo.adjustLikeCount(
      discussionId,
      isLiked ? -1 : 1,
    );
    return { isLiked: !isLiked, likeCount: updated?.likeCount ?? 0 };
  }

  async addManager(
    id: string,
    targetUserId: string,
    requesterId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    this.assertCreatorOrAdmin(discussion, requesterId, role, username);
    if (discussion.managerIds.includes(targetUserId)) return discussion;
    const updated = await this.repo.update(id, {
      managerIds: [...discussion.managerIds, targetUserId],
    });
    const target = await this.usersRepo.findById(targetUserId);
    if (target) {
      await this.notifyUser(
        targetUserId,
        target.username,
        'Jsi správce diskuze',
        `Byl/a jsi přidán/a jako správce diskuze "${discussion.title}".`,
      );
    }
    return updated!;
  }

  async removeManager(
    id: string,
    targetUserId: string,
    requesterId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    this.assertCreatorOrAdmin(discussion, requesterId, role, username);
    if (targetUserId === discussion.creatorId)
      throw new BadRequestException('Tvůrce diskuze nelze odebrat ze správců');
    const updated = await this.repo.update(id, {
      managerIds: discussion.managerIds.filter((uid) => uid !== targetUserId),
    });
    return updated!;
  }

  async requestJoin(
    id: string,
    userId: string,
    username: string,
  ): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    if (discussion.isOpen)
      throw new BadRequestException(
        'Diskuze je otevřená — přístup nevyžaduje žádost',
      );
    const alreadyHasAccess =
      discussion.creatorId === userId ||
      discussion.managerIds.includes(userId) ||
      discussion.invitedUserIds.includes(userId);
    if (alreadyHasAccess || discussion.joinRequestIds.includes(userId))
      return discussion;
    const updated = await this.repo.update(id, {
      joinRequestIds: [...discussion.joinRequestIds, userId],
    });
    await this.notifyManagers(
      discussion,
      'Nová žádost o přidání do diskuze',
      `Uživatel ${username} žádá o přidání do diskuze "${discussion.title}".`,
    );
    return updated!;
  }

  async resolveJoinRequest(
    id: string,
    targetUserId: string,
    accept: boolean,
    requesterId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion)
      throw new NotFoundException({
        code: 'DISCUSSION_NOT_FOUND',
        message: 'Diskuze nenalezena',
      });
    if (!this.isManagerOrAdmin(discussion, requesterId, role, username))
      throw new ForbiddenException({
        code: 'DISCUSSION_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    if (!discussion.joinRequestIds.includes(targetUserId))
      throw new NotFoundException({
        code: 'JOIN_REQUEST_NOT_FOUND',
        message: 'Žádost nenalezena',
      });
    const patch: Partial<IkarosDiscussion> = {
      joinRequestIds: discussion.joinRequestIds.filter(
        (uid) => uid !== targetUserId,
      ),
    };
    if (accept && !discussion.invitedUserIds.includes(targetUserId)) {
      patch.invitedUserIds = [...discussion.invitedUserIds, targetUserId];
    }
    const updated = await this.repo.update(id, patch);
    const target = await this.usersRepo.findById(targetUserId);
    if (target) {
      await this.notifyUser(
        targetUserId,
        target.username,
        accept
          ? 'Žádost o přidání do diskuze schválena'
          : 'Žádost o přidání do diskuze zamítnuta',
        accept
          ? `Byl/a jsi přidán/a do diskuze "${discussion.title}".`
          : `Tvá žádost o přidání do diskuze "${discussion.title}" byla zamítnuta.`,
      );
    }
    return updated!;
  }

  // ─── B4d — moderační enforcement (spec 20B, modul `moderation`) ─────────────
  // Nahlašování příspěvků řeší generický modul `moderation` (queue
  // `content_report`). `resolveReport` v moderaci vyšle `moderation.enforce`;
  // `DiscussionsModerationEnforcementListener` volá tyto systémové metody.

  /**
   * B4d — moderační skrytí / odkrytí příspěvku (akce M2/M3 a revert). Systémová
   * cesta z enforcement listeneru; BEZ autorského/role guardu (autorizoval už
   * moderační zásah). Na neznámém id vrátí false, nikdy nehází.
   */
  async setPostModerationHidden(
    postId: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    return this.postsRepo.setModerationHidden(postId, hidden, reason);
  }

  /**
   * B4d — moderační smazání příspěvku (akce M4). Systémová cesta bez access
   * guardu; dohledá post kvůli `discussionId` (kvůli dekrementu postCount).
   * Na neznámém id vrátí false, nikdy nehází.
   */
  async moderationDeletePost(postId: string): Promise<boolean> {
    const post = await this.postsRepo.findById(postId);
    if (!post) return false;
    await this.postsRepo.delete(postId);
    await this.repo.adjustPostCount(post.discussionId, -1);
    return true;
  }
}
