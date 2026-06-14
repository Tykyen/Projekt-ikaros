import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DAY_MS } from '../../common/constants/time.constants';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IUsernameChangeRequestsRepository } from '../users/interfaces/username-change-requests-repository.interface';
import type { IRefreshTokenRepository } from '../auth/interfaces/refresh-token-repository.interface';
import type {
  AdminAuditAction,
  AuditTargetType,
  IAdminAuditLogRepository,
} from './interfaces/admin-audit-log.interface';
import { UserBanCacheService } from '../users/services/user-ban-cache.service';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import {
  assessPJHandover,
  executePJHandover,
} from '../users/helpers/pj-handover.helper';
import {
  User,
  UserRole,
  DEFAULT_ADMIN_PERMISSIONS,
} from '../users/interfaces/user.interface';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { AdminDeleteUserDto } from './dto/admin-delete-user.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { SetAdminPermissionsDto } from './dto/set-admin-permissions.dto';
import { BulkBanDto } from './dto/bulk-ban.dto';
import { BulkUnbanDto } from './dto/bulk-unban.dto';
import { BulkRoleChangeDto } from './dto/bulk-role-change.dto';
import { assertCanChangeRole, assertCanModerate } from './helpers/hierarchy';

interface AdminUser {
  id: string;
  role: UserRole;
}

type SafeUser = Omit<User, 'passwordHash'>;

function stripPassword(user: User): SafeUser {
  const { passwordHash: _, ...rest } = user;
  return rest;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IUsernameChangeRequestsRepository')
    private readonly usernameRequestsRepo: IUsernameChangeRequestsRepository,
    @Inject('IRefreshTokenRepository')
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject('IAdminAuditLogRepository')
    private readonly auditRepo: IAdminAuditLogRepository,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    private readonly banCache: UserBanCacheService,
    // 1.7 — emit eventů pro notifikační maily (D-026 + admin delete D-036)
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  /** 1.7 — hold dní pro soft-delete (sdílené s UsersService přes ENV `DELETION_HOLD_DAYS`). */
  private getDeletionHoldDays(): number {
    const raw = this.configService.get<string | number>('DELETION_HOLD_DAYS');
    const parsed = raw !== undefined ? Number(raw) : 30;
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 30;
  }

  // D-024 — Lokální helper pro logování admin akcí (best-effort, nikdy nehází).
  private async audit(
    actor: User,
    target: { id: string; username: string },
    action: AdminAuditAction,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    reason?: string,
  ): Promise<void> {
    try {
      await this.auditRepo.record({
        actorId: actor.id,
        actorUsername: actor.username,
        targetId: target.id,
        targetUsername: target.username,
        action,
        before,
        after,
        reason: reason ?? null,
      });
    } catch {
      // Audit failure nesmí blokovat business logiku — log silently.
    }
  }

  async getUsers(opts: {
    username?: string;
    role?: UserRole;
    page: number;
    limit: number;
    /** 1.3c — filter jen pending deletion (pro admin dashboard) */
    hasPendingDeletion?: boolean;
    /** 1.3c — viditelnost tombstone řádků; default false (skrývá `isDeleted=true`) */
    includeDeleted?: boolean;
  }) {
    const result = await this.usersRepo.findAllPaginated(opts);
    // 1.3c — filter na FE-úrovni (zatímco repository neumí includeDeleted / hasPendingDeletion)
    // by způsobil nekonzistentní paginaci. Bezpečnější: filtrovat in-memory po vytahu.
    // Pro malé limity (≤ 100) je in-memory přijatelné; refactor do query je dluh.
    let items = result.items;
    if (!opts.includeDeleted) {
      items = items.filter((u) => !u.isDeleted);
    }
    if (opts.hasPendingDeletion) {
      items = items.filter((u) => !!u.deletionRequestedAt);
    }
    return { items: items.map(stripPassword), total: result.total };
  }

  async updateUserRole(actor: User, userId: string, role: UserRole) {
    const target = await this.usersRepo.findById(userId);
    if (!target)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    assertCanChangeRole(actor, target, role);
    const user = await this.usersRepo.update(userId, { role });
    if (user) {
      await this.audit(
        actor,
        target,
        'ROLE_CHANGE',
        { role: target.role },
        { role: user.role },
      );
      // C-31 — real-time signál cílovému uživateli (refetch identity).
      this.eventEmitter.emit('user.identity.changed', {
        userId,
        kind: 'role',
      });
    }
    return user ? stripPassword(user) : null;
  }

  async createUser(actor: User, dto: CreateUserAdminDto): Promise<SafeUser> {
    const targetRole = dto.role ?? UserRole.Ikarus;
    // Virtuální target: vznikne nový user, takže pro hierarchy check použijeme
    // jen kontroly newRole (target.role je irelevantní — žádný target ještě neexistuje).
    // Konstruujeme dummy target s low-tier role aby check vyhodnotil jen newRole.
    assertCanChangeRole(
      actor,
      { id: 'new', role: UserRole.Ikarus },
      targetRole,
    );

    const usernameTaken = await this.usersRepo.findByUsername(dto.username);
    if (usernameTaken)
      throw new ConflictException({
        message: 'Username již existuje',
        code: 'USERNAME_TAKEN',
      });

    const emailTaken = await this.usersRepo.findByEmail(dto.email);
    if (emailTaken)
      throw new ConflictException({
        message: 'Email již existuje',
        code: 'EMAIL_TAKEN',
      });

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersRepo.save({
      email: dto.email.toLowerCase(),
      username: dto.username,
      passwordHash,
      role: targetRole,
      isOnline: false,
      lastSeenAt: new Date(),
      adminPermissions: { ...DEFAULT_ADMIN_PERMISSIONS },
    });
    return stripPassword(user);
  }

  // ── 1.3b — Username requests (admin schvalování) ─────────────────────

  async listUsernameRequests(opts: {
    status?: 'pending' | 'approved' | 'rejected';
    page: number;
    limit: number;
  }) {
    const result = await this.usernameRequestsRepo.listPaginated(opts);
    const items = await Promise.all(
      result.items.map(async (req) => {
        const user = await this.usersRepo.findById(req.userId);
        const decidedBy = req.decidedBy
          ? await this.usersRepo.findById(req.decidedBy)
          : null;
        return {
          id: req.id,
          requestedUsername: req.requestedUsername,
          status: req.status,
          requestedAt: req.requestedAt,
          decidedAt: req.decidedAt,
          decisionReason: req.decisionReason,
          user: user
            ? {
                id: user.id,
                username: user.username,
                avatarUrl: user.avatarUrl ?? null,
                defaultAvatarType: user.defaultAvatarType,
              }
            : null,
          decidedBy: decidedBy
            ? { id: decidedBy.id, username: decidedBy.username }
            : null,
        };
      }),
    );
    return { items, total: result.total };
  }

  async approveUsernameRequest(actor: User, requestId: string) {
    const request = await this.usernameRequestsRepo.findById(requestId);
    if (!request)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Žádost neexistuje',
      });
    if (request.status !== 'pending')
      throw new ConflictException({
        code: 'ALREADY_DECIDED',
        message: 'Žádost už byla rozhodnuta',
      });

    // Race recheck — někdo mohl mezitím obsadit username.
    const taken = await this.usersRepo.findByUsername(
      request.requestedUsername,
    );
    if (taken) {
      await this.usernameRequestsRepo.update(requestId, {
        status: 'rejected',
        decidedAt: new Date(),
        decidedBy: actor.id,
        decisionReason: 'Username byl mezitím obsazen',
      });
      throw new ConflictException({
        code: 'USERNAME_TAKEN_RECHECK',
        message:
          'Username byl mezitím obsazen, žádost byla automaticky zamítnuta',
      });
    }

    const now = new Date();
    const updatedUser = await this.usersRepo.update(request.userId, {
      username: request.requestedUsername,
      usernameChangedAt: now,
    });
    if (!updatedUser)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Cílový uživatel již neexistuje',
      });

    const updatedRequest = await this.usernameRequestsRepo.update(requestId, {
      status: 'approved',
      decidedAt: now,
      decidedBy: actor.id,
    });
    // D-024 — audit (před: starý username z request kontextu; po: nový)
    await this.audit(
      actor,
      { id: updatedUser.id, username: updatedUser.username },
      'USERNAME_REQUEST_APPROVED',
      { username: null, requestedUsername: request.requestedUsername },
      { username: updatedUser.username },
    );

    // 1.7 D-026 — notifikační mail žadateli
    this.eventEmitter.emit('username-request.decided', {
      userId: updatedUser.id,
      status: 'approved',
      newUsername: updatedUser.username,
    });

    return {
      request: updatedRequest,
      user: stripPassword(updatedUser),
    };
  }

  async rejectUsernameRequest(
    actor: User,
    requestId: string,
    dto: RejectRequestDto,
  ) {
    const request = await this.usernameRequestsRepo.findById(requestId);
    if (!request)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Žádost neexistuje',
      });
    if (request.status !== 'pending')
      throw new ConflictException({
        code: 'ALREADY_DECIDED',
        message: 'Žádost už byla rozhodnuta',
      });

    const updated = await this.usernameRequestsRepo.update(requestId, {
      status: 'rejected',
      decidedAt: new Date(),
      decidedBy: actor.id,
      ...(dto.reason ? { decisionReason: dto.reason } : {}),
    });
    // D-024 — audit
    const targetUser = await this.usersRepo.findById(request.userId);
    if (targetUser) {
      await this.audit(
        actor,
        { id: targetUser.id, username: targetUser.username },
        'USERNAME_REQUEST_REJECTED',
        { requestedUsername: request.requestedUsername },
        { rejected: true },
        dto.reason,
      );
    }

    // 1.7 D-026 — notifikační mail žadateli
    this.eventEmitter.emit('username-request.decided', {
      userId: request.userId,
      status: 'rejected',
      reason: dto.reason,
    });

    return { request: updated };
  }

  // ── 1.3b — Ban / Unban ────────────────────────────────────────────────

  async banUser(actor: User, userId: string, dto: BanUserDto) {
    const target = await this.usersRepo.findById(userId);
    if (!target)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    assertCanModerate(actor, target, 'BAN');
    if (target.bannedAt) {
      throw new ConflictException({
        code: 'ALREADY_BANNED',
        message: 'Uživatel už je zabanovaný',
      });
    }
    const now = new Date();
    // D-023 — timed ban: 0 nebo undefined = trvalý
    const bannedUntil =
      dto.durationDays && dto.durationDays > 0
        ? new Date(now.getTime() + dto.durationDays * 24 * 60 * 60 * 1000)
        : null;
    const updated = await this.usersRepo.update(userId, {
      bannedAt: now,
      bannedBy: actor.id,
      ...(dto.reason ? { banReason: dto.reason } : {}),
      bannedUntil: bannedUntil ?? undefined,
    });
    if (!updated)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    await this.refreshTokenRepo.revokeAllForUser(userId);
    this.banCache.invalidate(userId);
    await this.audit(
      actor,
      target,
      'BAN',
      { bannedAt: null },
      {
        bannedAt: updated.bannedAt,
        banReason: updated.banReason,
        bannedUntil,
      },
      dto.reason,
    );
    // C-31 — real-time signál cílovému uživateli (ban = force logout / refetch).
    this.eventEmitter.emit('user.identity.changed', {
      userId,
      kind: 'ban',
    });
    return { user: stripPassword(updated) };
  }

  async unbanUser(actor: User, userId: string) {
    const target = await this.usersRepo.findById(userId);
    if (!target)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    assertCanModerate(actor, target, 'UNBAN');
    if (!target.bannedAt) {
      throw new ConflictException({
        code: 'NOT_BANNED',
        message: 'Uživatel není zabanovaný',
      });
    }
    const updated = await this.usersRepo.update(userId, {
      bannedAt: undefined,
      bannedBy: undefined,
      banReason: undefined,
      bannedUntil: undefined,
    });
    if (!updated)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    this.banCache.invalidate(userId);
    await this.audit(
      actor,
      target,
      'UNBAN',
      {
        bannedAt: target.bannedAt,
        banReason: target.banReason,
        bannedUntil: target.bannedUntil,
      },
      { bannedAt: null },
    );
    // C-31 — real-time signál cílovému uživateli (unban = refetch identity).
    this.eventEmitter.emit('user.identity.changed', {
      userId,
      kind: 'unban',
    });
    return { user: stripPassword(updated) };
  }

  // ── 1.3c — Moderační delete (admin/superadmin) ────────────────────────

  /**
   * 1.3c — admin spustí 30denní hold smazání cizího účtu.
   * - Hierarchy guards stejné jako BAN.
   * - Reason je povinný (povinný kontext pro audit log).
   * - Refresh tokeny target usera revokovány → auto-logout všech zařízení.
   * - PJ handover (Pomocný PJ auto-promote) řeší Fáze 6 — zatím stub bez handover.
   */
  async requestUserDeletion(
    actor: User,
    userId: string,
    dto: AdminDeleteUserDto,
  ) {
    const target = await this.usersRepo.findById(userId);
    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    }
    assertCanModerate(actor, target, 'DELETE');
    if (target.isDeleted) {
      throw new ConflictException({
        code: 'ALREADY_DELETED',
        message: 'Účet už byl odstraněn',
      });
    }
    if (target.deletionRequestedAt) {
      throw new ConflictException({
        code: 'ALREADY_PENDING_DELETION',
        message: 'Účet už čeká na smazání',
      });
    }

    // 1.3c — PJ handover: pokud target je jediný PJ a má Pomocného PJ, povýšíme.
    // Pokud nemá Pomocného PJ ve světě → SOLE_PJ_BLOCK.
    const plan = await assessPJHandover(userId, {
      membershipRepo: this.membershipRepo,
      worldsRepo: this.worldsRepo,
      usersRepo: this.usersRepo,
    });
    if (plan.blocking.length > 0) {
      throw new BadRequestException({
        code: 'SOLE_PJ_BLOCK',
        message:
          'Nelze smazat účet — uživatel je jediný PJ ve světech bez Pomocného PJ',
        worlds: plan.blocking,
      });
    }
    await executePJHandover(plan, { membershipRepo: this.membershipRepo });

    const now = new Date();
    const updated = await this.usersRepo.update(userId, {
      deletionRequestedAt: now,
      deletionRequestedBy: actor.id,
      deletionReason: dto.reason,
      // D-034b — snapshot povýšených Pomocných PJ pro info při reaktivaci
      deletionPromotions: plan.promotions.map((p) => ({
        worldId: p.worldId,
        worldName: p.worldName,
        worldSlug: p.worldSlug,
        promotedUserId: p.promotedUserId,
        promotedUsername: p.promotedUsername,
      })),
    });
    if (!updated) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    }
    await this.refreshTokenRepo.revokeAllForUser(userId);
    this.banCache.invalidate(userId);
    await this.audit(
      actor,
      target,
      'ACCOUNT_DELETE_REQUEST',
      { deletionRequestedAt: null },
      {
        deletionRequestedAt: now,
        deletionReason: dto.reason,
      },
      dto.reason,
    );

    // 1.7 D-036 — notifikační mail user (admin moderation delete)
    const scheduledHardDeleteAt = new Date(
      now.getTime() + this.getDeletionHoldDays() * DAY_MS,
    );
    this.eventEmitter.emit('account.deletion.scheduled', {
      userId,
      scheduledHardDeleteAt,
      reason: dto.reason,
      byAdmin: true,
    });

    return { user: stripPassword(updated) };
  }

  /**
   * 1.3c — admin revertne pending soft-delete (před hard cleanup cronem).
   */
  async cancelUserDeletion(actor: User, userId: string) {
    const target = await this.usersRepo.findById(userId);
    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    }
    assertCanModerate(actor, target, 'UNDELETE');
    if (target.isDeleted) {
      throw new ConflictException({
        code: 'ALREADY_DELETED',
        message: 'Účet už byl odstraněn — nelze revertnout',
      });
    }
    if (!target.deletionRequestedAt) {
      throw new NotFoundException({
        code: 'NO_PENDING_DELETION',
        message: 'Účet nečeká na smazání',
      });
    }
    const updated = await this.usersRepo.update(userId, {
      deletionRequestedAt: undefined,
      deletionRequestedBy: undefined,
      deletionReason: undefined,
    });
    if (!updated) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    }
    this.banCache.invalidate(userId);
    await this.audit(
      actor,
      target,
      'ACCOUNT_DELETE_CANCEL',
      {
        deletionRequestedAt: target.deletionRequestedAt,
        deletionReason: target.deletionReason,
      },
      { deletionRequestedAt: null },
    );
    return { user: stripPassword(updated) };
  }

  // ── 1.3b — canManageAdmins toggle (Superadmin-only) ──────────────────

  async setAdminPermissions(
    actor: User,
    userId: string,
    dto: SetAdminPermissionsDto,
  ) {
    // R-05 (A) — dřív Superadmin-only; nově i Admin s `canManageAdmins`.
    // `actor` je RequestUser (jen id+role, bez adminPermissions) → pro flag
    // načti plný záznam. Self-target i target=Admin gate zůstávají = Admin-manager
    // smí editovat JEN jiné Adminy, ne sebe, ne Superadmina.
    const isSuperadmin = actor.role === UserRole.Superadmin;
    let canManage = isSuperadmin;
    if (!isSuperadmin && actor.role === UserRole.Admin) {
      const actorFull = await this.usersRepo.findById(actor.id);
      canManage = !!actorFull?.adminPermissions?.canManageAdmins;
    }
    if (!canManage) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message:
          'Spravovat oprávnění Adminů smí Superadmin nebo Admin s canManageAdmins.',
      });
    }
    // R-05 (A) — flag `canManageAdmins` (mintit další admin-managery) smí měnit
    // JEN Superadmin. Admin-manager smí delegovat jen `canModerateContent` —
    // brání řetězovému šíření manage-práva mezi Adminy.
    if (!isSuperadmin && dto.canManageAdmins !== undefined) {
      throw new ForbiddenException({
        code: 'SUPERADMIN_ONLY_FLAG',
        message: 'Flag canManageAdmins smí měnit jen Superadmin.',
      });
    }
    if (actor.id === userId) {
      throw new BadRequestException({
        code: 'SELF_FORBIDDEN',
        message: 'Sebe nelze upravit',
      });
    }
    const target = await this.usersRepo.findById(userId);
    if (!target)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    if (target.role !== UserRole.Admin) {
      throw new BadRequestException({
        code: 'NOT_ADMIN',
        message: 'Admin permissions mají smysl jen pro role Admin',
      });
    }
    // D-033 — granular merge: aplikuje jen pole, která dto explicitně předala.
    // target.adminPermissions může být undefined (zatím nezacílený admin) — fallback DEFAULT_ADMIN_PERMISSIONS.
    const currentPerms = target.adminPermissions ?? DEFAULT_ADMIN_PERMISSIONS;
    const nextPermissions = {
      canManageAdmins: dto.canManageAdmins ?? currentPerms.canManageAdmins,
      canModerateContent:
        dto.canModerateContent ?? currentPerms.canModerateContent,
      canEditPlatformPages:
        dto.canEditPlatformPages ?? currentPerms.canEditPlatformPages,
    };
    const updated = await this.usersRepo.update(userId, {
      adminPermissions: nextPermissions,
    });
    if (!updated)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    // D-032 — Audit canManageAdmins toggle (a obecně všechny permission flagy)
    await this.audit(
      actor,
      target,
      'ADMIN_PERMISSIONS_CHANGE',
      { adminPermissions: target.adminPermissions },
      { adminPermissions: nextPermissions },
    );
    return { user: stripPassword(updated) };
  }

  // ── D-025 — Bulk akce ────────────────────────────────────────────────

  async bulkBan(actor: User, dto: BulkBanDto) {
    const successful: string[] = [];
    const failed: Array<{ userId: string; code: string; message: string }> = [];
    for (const userId of dto.userIds) {
      try {
        await this.banUser(actor, userId, {
          reason: dto.reason,
          durationDays: dto.durationDays,
        });
        successful.push(userId);
      } catch (err: unknown) {
        const e = err as { response?: { code?: string; message?: string } };
        failed.push({
          userId,
          code: e.response?.code ?? 'UNKNOWN',
          message: e.response?.message ?? 'Selhalo',
        });
      }
    }
    return { successful, failed };
  }

  async bulkUnban(actor: User, dto: BulkUnbanDto) {
    const successful: string[] = [];
    const failed: Array<{ userId: string; code: string; message: string }> = [];
    for (const userId of dto.userIds) {
      try {
        await this.unbanUser(actor, userId);
        successful.push(userId);
      } catch (err: unknown) {
        const e = err as { response?: { code?: string; message?: string } };
        failed.push({
          userId,
          code: e.response?.code ?? 'UNKNOWN',
          message: e.response?.message ?? 'Selhalo',
        });
      }
    }
    return { successful, failed };
  }

  async bulkRoleChange(actor: User, dto: BulkRoleChangeDto) {
    const successful: string[] = [];
    const failed: Array<{ userId: string; code: string; message: string }> = [];
    for (const userId of dto.userIds) {
      try {
        await this.updateUserRole(actor, userId, dto.role);
        successful.push(userId);
      } catch (err: unknown) {
        const e = err as { response?: { code?: string; message?: string } };
        failed.push({
          userId,
          code: e.response?.code ?? 'UNKNOWN',
          message: e.response?.message ?? 'Selhalo',
        });
      }
    }
    return { successful, failed };
  }

  // ── D-024 — Audit log listing ────────────────────────────────────────

  async listAuditLog(opts: {
    action?: AdminAuditAction;
    actorId?: string;
    targetId?: string;
    targetType?: AuditTargetType;
    page: number;
    limit: number;
  }) {
    return this.auditRepo.listPaginated(opts);
  }

  async getRecentPages(_requester: AdminUser, limit: number) {
    // D-053 — endpoint zúžen na Sa/Admin (viz @Roles na controlleru).
    // Historická větev pro PJ-in-any-world byla odstraněna; pokud bude potřeba
    // PJ vidět vlastní stránky, půjde to novým endpointem nad WorldMembership.
    return this.pagesRepo.findRecent(limit, undefined);
  }

  // ── 1.3c D-035 — audit handlers pro self + cron events ───────────────
  // (Admin moderation akce zapisují audit synchronně přes private `audit()`.)

  @OnEvent('user.deletion.requested')
  async onUserDeletionRequested(payload: {
    userId: string;
    requestedBy: string;
    isModeration: boolean;
    username: string;
    promotedHelpers?: Array<{
      worldId: string;
      worldName: string;
      promotedUserId: string;
      promotedUsername: string;
    }>;
  }) {
    if (payload.isModeration) return; // admin akce už auditovaná synchronně
    try {
      await this.auditRepo.record({
        actorId: payload.userId,
        actorUsername: payload.username,
        targetId: payload.userId,
        targetUsername: payload.username,
        action: 'ACCOUNT_SELF_DELETE_REQUEST',
        before: { deletionRequestedAt: null },
        after: {
          deletionRequestedAt: new Date().toISOString(),
          promotedHelpers: payload.promotedHelpers ?? [],
        },
        reason: null,
      });
    } catch {
      // Audit failure nesmí blokovat business logiku
    }
  }

  @OnEvent('user.deletion.cancelled')
  async onUserDeletionCancelled(payload: {
    userId: string;
    username: string;
    cancelledBy: string;
  }) {
    // Self-cancel (rare). Admin cancel je auditovaný synchronně přes cancelUserDeletion.
    if (payload.cancelledBy !== payload.userId) return;
    try {
      await this.auditRepo.record({
        actorId: payload.userId,
        actorUsername: payload.username,
        targetId: payload.userId,
        targetUsername: payload.username,
        action: 'ACCOUNT_DELETE_CANCEL',
        before: { deletionRequestedAt: 'pending' },
        after: { deletionRequestedAt: null },
        reason: 'Self-cancel během race condition',
      });
    } catch {
      // silent
    }
  }

  @OnEvent('user.deletion.reactivated')
  async onUserDeletionReactivated(payload: {
    userId: string;
    username: string;
    previousDeletionRequestedAt: Date | undefined;
  }) {
    try {
      await this.auditRepo.record({
        actorId: payload.userId,
        actorUsername: payload.username,
        targetId: payload.userId,
        targetUsername: payload.username,
        action: 'ACCOUNT_SELF_REACTIVATE',
        before: {
          deletionRequestedAt:
            payload.previousDeletionRequestedAt?.toISOString() ?? null,
        },
        after: { deletionRequestedAt: null },
        reason: 'Reaktivace přes login flow',
      });
    } catch {
      // silent
    }
  }

  @OnEvent('user.deletion.hardDeleted')
  async onUserDeletionHardDeleted(payload: {
    userId: string;
    username: string;
    deletionRequestedBy: string | undefined;
    deletionReason: string | undefined;
    deletionRequestedAt: Date | undefined;
  }) {
    try {
      await this.auditRepo.record({
        actorId: 'system',
        actorUsername: 'AccountCleanupCron',
        targetId: payload.userId,
        targetUsername: payload.username,
        action: 'ACCOUNT_HARD_DELETE',
        before: {
          deletionRequestedAt:
            payload.deletionRequestedAt?.toISOString() ?? null,
          deletionRequestedBy: payload.deletionRequestedBy ?? null,
          deletionReason: payload.deletionReason ?? null,
        },
        after: { isDeleted: true, deletedAt: new Date().toISOString() },
        reason: payload.deletionReason ?? null,
      });
    } catch {
      // silent
    }
  }
}
