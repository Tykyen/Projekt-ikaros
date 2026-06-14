import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { IUsersRepository } from './interfaces/users-repository.interface';
import {
  User,
  PublicUser,
  UserRole,
  PublicUserListItem,
  PublicUserProfile,
  TombstoneInfo,
} from './interfaces/user.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailerService } from '../mailer/mailer.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IUsernameChangeRequestsRepository } from './interfaces/username-change-requests-repository.interface';
import type { UsernameChangeRequest } from './interfaces/username-change-request.interface';
import type { IFriendshipsRepository } from '../friendships/interfaces/friendships-repository.interface';
import type { ICharactersRepository } from '../characters/interfaces/characters-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { MyCharacterEntry } from './interfaces/user.interface';
import type { DeletionPromotion } from './interfaces/user.interface';
import { UserBanCacheService } from './services/user-ban-cache.service';
import {
  assessPJHandover,
  executePJHandover,
} from './helpers/pj-handover.helper';

type SanitizedUser = Omit<User, 'passwordHash'>;

const DAY_MS = 24 * 60 * 60 * 1000;
const DELETION_HOLD_DAYS = 30; // 1.3c — hardcoded (admin-config = dluh)

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  static readonly EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000; // 1 hodina

  /** D-040 — TTL pro tombstone cache, viz `findManyTombstoneInfo`. */
  static readonly TOMBSTONE_CACHE_TTL_MS = 60 * 1000; // 60 s

  /** D-040 — in-memory cache (single-instance dev). Multi-instance: invalidace via Redis pub/sub (D-028 pattern). */
  private readonly tombstoneCache = new Map<
    string,
    { info: TombstoneInfo; expiresAt: number }
  >();

  constructor(
    @Inject('IUsersRepository') private readonly repo: IUsersRepository,
    private readonly eventEmitter: EventEmitter2,
    // SP3:
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IUsernameChangeRequestsRepository')
    private readonly usernameRequestsRepo: IUsernameChangeRequestsRepository,
    private readonly mailer: MailerService,
    private readonly securityTokens: SecurityTokensService,
    // D-057 — friend-only profil visibility check.
    @Inject('IFriendshipsRepository')
    private readonly friendsRepo: IFriendshipsRepository,
    // 8.3 / D-075 — cross-world character agregátor pro profil.
    @Inject('ICharactersRepository')
    private readonly charactersRepo: ICharactersRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    // N-6b (1.3c) — self-deletion invaliduje ban/deletion cache.
    private readonly banCache: UserBanCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Migration: case-insensitive username (usernameLower index).
    // 1) Detekce existujících case-konfliktů (Karel + karel) → log + abort.
    // 2) Backfill usernameLower pro pre-migration záznamy.
    const conflicts = await this.repo.findUsernameCaseConflicts();
    if (conflicts.length > 0) {
      this.logger.error(
        `Username case konflikt — manuální zásah nutný před backfillem: ${JSON.stringify(conflicts)}`,
      );
      return;
    }
    const result = await this.repo.backfillUsernameLower();
    if (result.updated > 0) {
      this.logger.log(
        `Backfill usernameLower: aktualizováno ${result.updated} záznamů`,
      );
    }
  }

  async findById(id: string): Promise<SanitizedUser> {
    const user = await this.repo.findById(id);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    return this.sanitize(user);
  }

  async publicProfile(id: string): Promise<PublicUser> {
    const user = await this.repo.findById(id);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      characterPath: user.characterPath,
      role: user.role,
      createdAt: user.createdAt,
      // „Neviditelný" mód (`hiddenPresence`) → presence se ostatním neukazuje.
      lastSeenAt: user.hiddenPresence ? undefined : user.lastSeenAt,
    };
  }

  /**
   * D-040 — batch tombstone lookup pro feature services (chat/articles/discussions/galerie).
   *
   * Vrací Map[id] → `{ isDeleted, displayName, avatarUrl }` se 60s in-memory cache.
   * Pro IDs které v DB neexistují (hard cleanup před tombstone migrací) vrací stub
   * `{ isDeleted: true, displayName: 'Smazaný účet' }`.
   *
   * Cache invalidace: explicitní `invalidateTombstoneCache(userId)` při delete/anonymize.
   * Pasivně přes 60s TTL.
   */
  async findManyTombstoneInfo(
    ids: string[],
  ): Promise<Map<string, TombstoneInfo>> {
    const out = new Map<string, TombstoneInfo>();
    if (ids.length === 0) return out;

    const now = Date.now();
    const distinct = Array.from(new Set(ids));
    const toFetch: string[] = [];

    // 1) Cache hits
    for (const id of distinct) {
      const cached = this.tombstoneCache.get(id);
      if (cached && cached.expiresAt > now) {
        out.set(id, cached.info);
      } else {
        toFetch.push(id);
      }
    }

    if (toFetch.length === 0) return out;

    // 2) DB lookup pro zbývající IDs
    const users = await this.repo.findByIds(toFetch);
    const foundIds = new Set<string>();
    for (const u of users) {
      foundIds.add(u.id);
      const info: TombstoneInfo = {
        isDeleted: u.isDeleted === true,
        displayName:
          u.isDeleted === true ? 'Smazaný účet' : (u.displayName ?? u.username),
        avatarUrl: u.isDeleted === true ? undefined : u.avatarUrl,
      };
      out.set(u.id, info);
      this.tombstoneCache.set(u.id, {
        info,
        expiresAt: now + UsersService.TOMBSTONE_CACHE_TTL_MS,
      });
    }

    // 3) Missing IDs → stub (hard cleanup před D-040 migrací)
    for (const id of toFetch) {
      if (foundIds.has(id)) continue;
      const stub: TombstoneInfo = {
        isDeleted: true,
        displayName: 'Smazaný účet',
      };
      out.set(id, stub);
      this.tombstoneCache.set(id, {
        info: stub,
        expiresAt: now + UsersService.TOMBSTONE_CACHE_TTL_MS,
      });
    }

    return out;
  }

  /**
   * D-040 — explicit invalidace tombstone cache záznamu (volat po anonymize /
   * displayName update / avatar update). 60s TTL pokrývá většinu případů, ale
   * explicitní invalidace zabrání stale read v chat WS broadcastu.
   */
  invalidateTombstoneCache(userId: string): void {
    this.tombstoneCache.delete(userId);
  }

  async update(id: string, dto: UpdateUserDto): Promise<SanitizedUser> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });

    if (dto.username !== undefined) {
      const taken = await this.repo.findByUsername(dto.username);
      if (taken && taken.id !== id)
        throw new ConflictException({
          code: 'USERNAME_TAKEN',
          message: 'Username je již obsazeno',
        });
    }

    const updateData: Partial<User> = {};
    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) updateData.avatarUrl = dto.avatarUrl;
    if (dto.characterPath !== undefined)
      updateData.characterPath = dto.characterPath;
    if (dto.username !== undefined) updateData.username = dto.username;
    if (dto.themeSettings != null) {
      updateData.themeSettings = {
        ...existing.themeSettings,
        ...dto.themeSettings,
      };
    }
    if (dto.chatPreferences != null) {
      updateData.chatPreferences = {
        ...existing.chatPreferences,
        ...dto.chatPreferences,
      };
    }
    if (dto.profileVisibility !== undefined)
      updateData.profileVisibility = dto.profileVisibility;
    if (dto.chatColor !== undefined) updateData.chatColor = dto.chatColor;
    // 1.3a BE catch-up — profilová pole
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.bio !== undefined) updateData.bio = dto.bio;
    if (dto.characterName !== undefined)
      updateData.characterName = dto.characterName;
    if (dto.characterBio !== undefined)
      updateData.characterBio = dto.characterBio;
    if (dto.characterAvatarUrl !== undefined)
      updateData.characterAvatarUrl = dto.characterAvatarUrl;
    if (dto.themeId !== undefined) updateData.themeId = dto.themeId;
    if (dto.defaultAvatarType !== undefined)
      updateData.defaultAvatarType = dto.defaultAvatarType;

    const updated = await this.repo.update(id, updateData);
    if (!updated)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    return this.sanitize(updated);
  }

  async exists(username: string): Promise<{ exists: boolean }> {
    if (username.length > 64)
      throw new BadRequestException({
        code: 'USERNAME_TOO_LONG',
        message: 'Username je příliš dlouhé',
      });
    const user = await this.repo.findByUsername(username);
    return { exists: user != null };
  }

  /**
   * Spec 3.4 — lehký lookup uživatelů pro pickery (pozvánky do diskuze,
   * přidání správce). Dostupný každému přihlášenému, vrací jen `id` + `username`.
   */
  async lookup(q: string): Promise<Array<{ id: string; username: string }>> {
    const query = q?.trim() ?? '';
    if (query.length < 2) return [];
    const { items } = await this.repo.findPublicPaginated({
      q: query,
      sort: 'username',
      page: 1,
      limit: 10,
      includeDeleted: false,
    });
    return items.map((u) => ({ id: u.id, username: u.username }));
  }

  async updateTheme(
    id: string,
    themeSettings: Record<string, unknown>,
  ): Promise<SanitizedUser> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });

    const merged = { ...(existing.themeSettings ?? {}), ...themeSettings };
    const updated = await this.repo.update(id, { themeSettings: merged });
    if (!updated)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    return this.sanitize(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'Nesprávné heslo',
      });
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
    this.eventEmitter.emit('user.password.changed', { userId });
  }

  async resetPassword(userId: string, dto: ResetPasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
    this.eventEmitter.emit('user.password.changed', { userId });
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
  }

  // ── SP3 — Spec 1.4 ─────────────────────────────────────────────────

  async listPublic(
    query: {
      q?: string;
      sort?: 'new' | 'recent' | 'username';
      page?: number;
      limit?: number;
      includeDeleted?: boolean;
    },
    requesterRole: UserRole,
  ): Promise<{
    items: PublicUserListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const isAdmin =
      requesterRole === UserRole.Admin || requesterRole === UserRole.Superadmin;
    const includeDeleted = isAdmin && !!query.includeDeleted;
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const sort = query.sort ?? 'new';

    const { items, total } = await this.repo.findPublicPaginated({
      q: query.q,
      sort,
      page,
      limit,
      includeDeleted,
      // D-045 — admin/Superadmin vidí i uživatele s `hiddenInDirectory: true`.
      includeHidden: isAdmin,
    });

    const userIds = items.map((u) => u.id);
    const counts = await this.membershipRepo.countsByUserIds(userIds);

    return {
      items: items.map((u) =>
        this.toPublicListItem(u, counts.get(u.id) ?? 0, isAdmin),
      ),
      total,
      page,
      limit,
    };
  }

  private toPublicListItem(
    user: User,
    worldsCount: number,
    isAdmin: boolean,
  ): PublicUserListItem {
    const item: PublicUserListItem = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      characterPath: user.characterPath,
      role: user.role,
      createdAt: user.createdAt,
      defaultAvatarType: user.defaultAvatarType,
      worldsCount,
    };
    if (isAdmin) {
      if (user.isDeleted) item.deleted = true;
      if (user.deletionRequestedAt) item.pendingDeletion = true;
    }
    return item;
  }

  async publicProfileV14(
    userId: string,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<PublicUserProfile> {
    const user = await this.repo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User nenalezen',
      });

    const isAdmin =
      requesterRole === UserRole.Admin || requesterRole === UserRole.Superadmin;
    const isTombstone = !!user.isDeleted;
    const isPending = !!user.deletionRequestedAt;

    if ((isTombstone || isPending) && !isAdmin) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User nenalezen',
      });
    }

    // D-057 — friend-only profil: nepřítel (a ne-admin, ne já) dostane 403.
    if (
      user.profileVisibility === 'friends' &&
      !isAdmin &&
      requesterId !== userId
    ) {
      const friendship = await this.friendsRepo.findActiveBetween(
        requesterId,
        userId,
      );
      if (friendship?.status !== 'accepted')
        throw new ForbiddenException({
          code: 'PROFILE_FRIENDS_ONLY',
          message: 'Tento profil je viditelný jen přátelům',
        });
    }

    const worldsCount = await this.membershipRepo.countByUserId(userId);

    // lastSeenAt: null pro hiddenPresence (D-052) NEBO tombstone (admin výjimka).
    let lastSeenAt: string | null;
    if (isTombstone || user.hiddenPresence) {
      lastSeenAt = null;
    } else {
      lastSeenAt = user.lastSeenAt ? user.lastSeenAt.toISOString() : null;
    }

    const profile: PublicUserProfile = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      characterPath: user.characterPath,
      role: user.role,
      createdAt: user.createdAt,
      defaultAvatarType: user.defaultAvatarType,
      worldsCount,
      lastSeenAt,
      // 1.3a — veřejná profilová pole + postava v Rozcestí (FE: veřejný
      // profil 1.4 + detail postavy v chatu).
      bio: user.bio,
      city: user.city,
      characterName: user.characterName,
      characterBio: user.characterBio,
      characterAvatarUrl: user.characterAvatarUrl,
    };

    if (isAdmin) {
      if (isTombstone) profile.deleted = true;
      if (isPending) profile.pendingDeletion = true;
      // 1.4 §15 — poslední přihlášení jen pro platformového admina.
      profile.lastLoginAt = user.lastLoginAt
        ? user.lastLoginAt.toISOString()
        : null;
    }

    return profile;
  }

  // ── SP3 — Spec 1.7 ─────────────────────────────────────────────────

  async requestEmailChange(
    userId: string,
    dto: { newEmail: string; currentPassword: string },
  ): Promise<{ ok: true; sentTo: string }> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User nenalezen',
        code: 'USER_NOT_FOUND',
      });
    }

    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new BadRequestException({
        message: 'Špatné aktuální heslo',
        code: 'INVALID_PASSWORD',
      });
    }

    const newEmailNormalized = dto.newEmail.toLowerCase().trim();
    if (newEmailNormalized === user.email.toLowerCase()) {
      throw new BadRequestException({
        message: 'Nový email je stejný jako aktuální',
        code: 'SAME_EMAIL',
      });
    }

    const existing = await this.repo.findByEmail(newEmailNormalized);
    if (existing && existing.id !== userId) {
      throw new ConflictException({
        message: 'Email už používá jiný uživatel',
        code: 'EMAIL_TAKEN',
      });
    }

    const token = await this.securityTokens.issue(
      userId,
      'email_change',
      UsersService.EMAIL_CHANGE_TTL_MS,
      { newEmail: newEmailNormalized },
    );

    try {
      await this.mailer.sendEmailChangeConfirm({
        to: newEmailNormalized,
        username: user.username,
        token,
      });
    } catch (err) {
      this.logger.warn(
        `requestEmailChange confirm mailer fail for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      await this.mailer.sendEmailChangeNotice({
        to: user.email,
        username: user.username,
        oldEmail: user.email,
        newEmail: newEmailNormalized,
      });
    } catch (err) {
      this.logger.warn(
        `requestEmailChange notice mailer fail for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { ok: true, sentTo: this.maskEmail(newEmailNormalized) };
  }

  // ── D-028 — toast po loginu o rozhodnuté username žádosti ───────────────

  /** Poslední rozhodnutá žádost usera, kterou ještě neviděl. */
  async getLastUnseenDecidedRequest(
    userId: string,
  ): Promise<{ request: ReturnType<UsersService['toRequestDto']> | null }> {
    const request =
      await this.usernameRequestsRepo.findLastUnseenDecidedByUserId(userId);
    return { request: request ? this.toRequestDto(request) : null };
  }

  /** Označí žádost za zhlédnutou. 404 pokud neexistuje nebo není žadatelova. */
  async markUsernameRequestSeen(
    userId: string,
    requestId: string,
  ): Promise<void> {
    const request = await this.usernameRequestsRepo.findById(requestId);
    if (!request || request.userId !== userId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Žádost neexistuje',
      });
    }
    if (request.seenAt) return; // idempotentní — opakovaný /seen nevadí
    await this.usernameRequestsRepo.markSeen(requestId);
  }

  // ── 1.3b (N-6b) — žádost o změnu username (base CRUD, FE je už volá) ─────

  /**
   * Vytvoří pending žádost o změnu username. Validace dle spec-1.3b:
   * same / cooldown 30 dní (od poslední approved změny) / duplicate /
   * jedna pending na uživatele. (D-025 — cooldown configurable odloženo → 30.)
   */
  async requestUsernameChange(
    userId: string,
    newUsername: string,
  ): Promise<{ request: ReturnType<UsersService['toRequestDto']> }> {
    const user = await this.repo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Uživatel neexistuje',
      });

    const requested = newUsername.trim();
    if (requested.toLowerCase() === user.username.toLowerCase())
      throw new ConflictException({
        code: 'SAME_USERNAME',
        message: 'Nová přezdívka je stejná jako současná.',
      });

    const COOLDOWN_DAYS = 30;
    if (user.usernameChangedAt) {
      const next = new Date(
        user.usernameChangedAt.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
      );
      if (next > new Date())
        throw new ConflictException({
          code: 'COOLDOWN_ACTIVE',
          message: `Změnu přezdívky lze požádat jen jednou za ${COOLDOWN_DAYS} dní.`,
        });
    }

    const taken = await this.repo.findByUsername(requested);
    if (taken)
      throw new ConflictException({
        code: 'USERNAME_TAKEN',
        message: 'Přezdívka je již obsazená.',
      });

    const existing =
      await this.usernameRequestsRepo.findPendingByUserId(userId);
    if (existing)
      throw new ConflictException({
        code: 'REQUEST_EXISTS',
        message: 'Už máš čekající žádost o změnu přezdívky.',
      });

    const request = await this.usernameRequestsRepo.create({
      userId,
      username: user.username,
      requestedUsername: requested,
    });
    return { request: this.toRequestDto(request) };
  }

  /** Vrátí aktuální pending žádost usera, nebo `null`. */
  async getPendingUsernameRequest(
    userId: string,
  ): Promise<{ request: ReturnType<UsersService['toRequestDto']> | null }> {
    const pending = await this.usernameRequestsRepo.findPendingByUserId(userId);
    return { request: pending ? this.toRequestDto(pending) : null };
  }

  /** Zruší vlastní pending žádost (idempotentní). */
  async cancelUsernameRequest(userId: string): Promise<void> {
    await this.usernameRequestsRepo.deletePending(userId);
  }

  // ── 1.3c (N-6b) — self-delete účtu (30denní hold + reaktivace) ──────────

  /**
   * Uživatel požádá o smazání účtu (30denní hold). Vzor:
   * `admin.requestUserDeletion`. PJ handover (auto-promote Pomocného PJ;
   * `SOLE_PJ_BLOCK` pokud jediný PJ bez Pomocného). `dryRun=true` vrátí jen
   * handover plán (FE preview), bez zápisu. Revoke tokenů přes event
   * `user.deletion.requested` (auth `@OnEvent` — vyhne se DI cyklu).
   */
  async requestSelfDeletion(
    userId: string,
    confirmUsername: string,
    dryRun = false,
  ): Promise<{
    deletionRequestedAt: Date | null;
    scheduledHardDeleteAt: Date | null;
    promotions: DeletionPromotion[];
  }> {
    const user = await this.repo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    if (user.isDeleted)
      throw new ConflictException({
        code: 'ALREADY_DELETED',
        message: 'Účet už byl odstraněn',
      });
    if (user.deletionRequestedAt)
      throw new ConflictException({
        code: 'ALREADY_PENDING_DELETION',
        message: 'Účet už čeká na smazání',
      });
    if (confirmUsername !== user.username)
      throw new BadRequestException({
        code: 'USERNAME_MISMATCH',
        message: 'Potvrzení přezdívky nesouhlasí.',
      });

    const plan = await assessPJHandover(userId, {
      membershipRepo: this.membershipRepo,
      worldsRepo: this.worldsRepo,
      usersRepo: this.repo,
    });
    if (plan.blocking.length > 0)
      throw new BadRequestException({
        code: 'SOLE_PJ_BLOCK',
        message:
          'Nelze smazat účet — jsi jediný PJ ve světech bez Pomocného PJ',
        worlds: plan.blocking,
      });

    const promotions: DeletionPromotion[] = plan.promotions.map((p) => ({
      worldId: p.worldId,
      worldName: p.worldName,
      worldSlug: p.worldSlug,
      promotedUserId: p.promotedUserId,
      promotedUsername: p.promotedUsername,
    }));

    if (dryRun)
      return {
        deletionRequestedAt: null,
        scheduledHardDeleteAt: null,
        promotions,
      };

    await executePJHandover(plan, { membershipRepo: this.membershipRepo });
    const now = new Date();
    await this.repo.update(userId, {
      deletionRequestedAt: now,
      deletionRequestedBy: userId,
      deletionReason: 'self-requested',
      deletionPromotions: promotions,
    });
    this.banCache.invalidate(userId);
    this.eventEmitter.emit('user.deletion.requested', { userId });
    const scheduledHardDeleteAt = new Date(
      now.getTime() + DELETION_HOLD_DAYS * DAY_MS,
    );
    this.eventEmitter.emit('account.deletion.scheduled', {
      userId,
      scheduledHardDeleteAt,
      reason: 'self-requested',
      byAdmin: false,
    });
    return { deletionRequestedAt: now, scheduledHardDeleteAt, promotions };
  }

  /** Stav self-delete žádosti (FE banner), nebo null. */
  async getSelfDeletionStatus(userId: string): Promise<{
    deletionRequestedAt: Date | null;
    scheduledHardDeleteAt: Date | null;
  }> {
    const user = await this.repo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    if (!user.deletionRequestedAt || user.isDeleted)
      return { deletionRequestedAt: null, scheduledHardDeleteAt: null };
    return {
      deletionRequestedAt: user.deletionRequestedAt,
      scheduledHardDeleteAt: new Date(
        user.deletionRequestedAt.getTime() + DELETION_HOLD_DAYS * DAY_MS,
      ),
    };
  }

  /** Zruší vlastní pending self-delete (před hard cleanupem; idempotentní). */
  async cancelSelfDeletion(userId: string): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user || !user.deletionRequestedAt || user.isDeleted) return;
    await this.repo.update(userId, {
      deletionRequestedAt: undefined,
      deletionRequestedBy: undefined,
      deletionReason: undefined,
    });
    this.banCache.invalidate(userId);
  }

  private toRequestDto(req: UsernameChangeRequest) {
    return {
      id: req.id,
      userId: req.userId,
      requestedUsername: req.requestedUsername,
      status: req.status,
      requestedAt: req.requestedAt,
      decidedAt: req.decidedAt,
      decidedBy: req.decidedBy,
      decisionReason: req.decisionReason,
      seenAt: req.seenAt,
    };
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const maskedLocal =
      local.length > 2 ? `${local[0]}***${local.slice(-1)}` : '***';
    return `${maskedLocal}@${domain}`;
  }

  private sanitize(user: User): SanitizedUser {
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  // ── 8.3 / D-074 — Oblíbené postavy per svět ─────────────────────────

  /**
   * Replace-all per (user × world). FE pošle aktuální slugy po toggle,
   * BE deduplikuje a uloží. Vrací **celou** mapu favoritních postav uživatele
   * (FE invaliduje cache `/users/me`).
   */
  async setFavoriteCharacters(
    userId: string,
    worldId: string,
    slugs: string[],
  ): Promise<Record<string, string[]>> {
    const user = await this.repo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    // Validace, že worldId je rozumný ObjectId tvar — abychom v Map klíčích
    // nedrželi nevalidní reference; samotnou existenci světa neověřujeme
    // (FE typicky volá z členského kontextu, navíc soft-link).
    if (!/^[0-9a-fA-F]{24}$/.test(worldId)) {
      throw new BadRequestException({
        code: 'INVALID_WORLD_ID',
        message: 'Neplatné worldId',
      });
    }
    const dedup = Array.from(new Set(slugs));
    const next = { ...(user.favoriteCharacters ?? {}) };
    if (dedup.length === 0) {
      delete next[worldId];
    } else {
      next[worldId] = dedup;
    }
    await this.repo.update(userId, { favoriteCharacters: next });
    return next;
  }

  // ── 5.2-followup — Osobní oblíbené STRÁNKY per svět ─────────────────

  /**
   * Replace-all per (user × world). FE pošle aktuální slugy po toggle/reorder,
   * BE deduplikuje (Set zachovává **pořadí** vložení → reorder funguje) a uloží.
   * Vrací **celou** mapu oblíbených stránek uživatele (FE invaliduje `/users/me`).
   */
  async setFavoritePages(
    userId: string,
    worldId: string,
    slugs: string[],
  ): Promise<Record<string, string[]>> {
    const user = await this.repo.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    if (!/^[0-9a-fA-F]{24}$/.test(worldId)) {
      throw new BadRequestException({
        code: 'INVALID_WORLD_ID',
        message: 'Neplatné worldId',
      });
    }
    const dedup = Array.from(new Set(slugs));
    const next = { ...(user.favoritePageSlugs ?? {}) };
    if (dedup.length === 0) {
      delete next[worldId];
    } else {
      next[worldId] = dedup;
    }
    await this.repo.update(userId, { favoritePageSlugs: next });
    return next;
  }

  /**
   * CD-08 (cascade-delete audit) — smazaná stránka: odeber její slug
   * z oblíbených (`favoritePageSlugs`) všech uživatelů (jinak mrtvý slug).
   */
  @OnEvent('page.deleted')
  async onPageDeleted(payload: {
    worldId: string;
    slug: string;
  }): Promise<void> {
    await this.repo.pullFavoritePageSlug(payload.worldId, payload.slug);
  }

  // ── 8.3 / D-075 — Cross-world přehled „mých postav" ─────────────────

  /**
   * Agregátor postav přihlášeného uživatele přes všechny jeho memberships.
   * Vrací jen membershipy, kde má `characterPath` a postava existuje.
   * Sort dle abecedy `worldName`.
   */
  async getMyCharacters(userId: string): Promise<MyCharacterEntry[]> {
    const memberships = await this.membershipRepo.findByUserId(userId);
    const withChar = memberships.filter(
      (m) => m.characterPath && m.characterPath.trim().length > 0,
    );
    if (withChar.length === 0) return [];

    const worldIds = Array.from(new Set(withChar.map((m) => m.worldId)));
    const worlds = await this.worldsRepo.findByIds(worldIds);
    const worldById = new Map(worlds.map((w) => [w.id, w]));

    const entries: MyCharacterEntry[] = [];
    for (const m of withChar) {
      const world = worldById.get(m.worldId);
      if (!world) continue; // smazaný svět — preskoč
      const character = await this.charactersRepo.findBySlugAndWorld(
        m.characterPath as string,
        m.worldId,
      );
      if (!character) continue; // smazaná postava — preskoč
      entries.push({
        worldId: world.id,
        worldName: world.name,
        worldSlug: world.slug,
        worldImageUrl: world.imageUrl,
        characterId: character.id,
        characterSlug: character.slug,
        characterName: character.name,
        isNpc: character.isNpc,
        // Spec 9.2 — propagace Character.kind do FE pro per-entity ikonu.
        kind: character.kind,
      });
    }
    entries.sort((a, b) => a.worldName.localeCompare(b.worldName, 'cs'));
    return entries;
  }
}
