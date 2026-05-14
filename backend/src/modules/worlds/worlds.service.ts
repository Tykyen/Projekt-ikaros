import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { forwardRef } from '@nestjs/common';
import type { IWorldsRepository } from './interfaces/worlds-repository.interface';
import type { IWorldMembershipRepository } from './interfaces/world-membership-repository.interface';
import type { IWorldSettingsRepository } from './interfaces/world-settings-repository.interface';
import { World, WorldCalendarConfig } from './interfaces/world.interface';
import {
  WorldMembership,
  WorldRole,
} from './interfaces/world-membership.interface';
import { WorldSettings } from './interfaces/world-settings.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateWorldDto } from './dto/create-world.dto';
import { UpdateWorldDto } from './dto/update-world.dto';
import { UpdateWorldSettingsDto } from './dto/update-world-settings.dto';
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';
import { SystemPresetsService } from '../system-presets/system-presets.service';
import { WorldWeatherService } from '../world-weather/world-weather.service';
import { UsersService } from '../users/users.service';
import type { IDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions-repository.interface';
import type {
  DiarySchemaVersion,
  DiarySchemaVersionMeta,
} from './diary-schema-versions/diary-schema-version.interface';

export interface RequestUser {
  id: string;
  role: UserRole;
  username: string;
}

/**
 * 2.3 D-NEW-quota — maximální počet aktivních světů, které smí mít jeden
 * vlastník (kromě globálních admin rolí). Soft-deleted světy se nepočítají.
 */
export const MAX_ACTIVE_WORLDS_PER_OWNER = 30;

@Injectable()
export class WorldsService {
  constructor(
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldSettingsRepository')
    private readonly settingsRepo: IWorldSettingsRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly currenciesService: WorldCurrenciesService,
    @Inject('IDiarySchemaVersionsRepository')
    private readonly diaryVersionsRepo: IDiarySchemaVersionsRepository,
    private readonly systemPresetsService: SystemPresetsService,
    @Inject(forwardRef(() => WorldWeatherService))
    private readonly weatherService: WorldWeatherService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async findAll(): Promise<World[]> {
    return this.worldsRepo.findAll();
  }

  async findById(id: string): Promise<World> {
    const world = await this.worldsRepo.findById(id);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    return this.enrichWithOwner(world);
  }

  async findBySlug(slug: string): Promise<World> {
    const world = await this.worldsRepo.findBySlug(slug);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    return this.enrichWithOwner(world);
  }

  /**
   * Spec 2.4 — populate `owner` (public summary) do detailu světa.
   * Pokud owner neexistuje (smazaný účet), pole zůstane undefined a FE/UI
   * zobrazí fallback („Vlastník neznámý").
   */
  private async enrichWithOwner(world: World): Promise<World> {
    try {
      const owner = await this.usersService.publicProfile(world.ownerId);
      return {
        ...world,
        owner: {
          id: owner.id,
          username: owner.username,
          avatarUrl: owner.avatarUrl,
        },
      };
    } catch {
      return world;
    }
  }

  async findMyWorlds(
    userId: string,
  ): Promise<{ world: World; membership: WorldMembership }[]> {
    const memberships = await this.membershipRepo.findByUserId(userId);
    if (memberships.length === 0) return [];
    const worldIds = memberships.map((m) => m.worldId);
    const worlds = await this.worldsRepo.findByIds(worldIds);
    const worldMap = new Map(worlds.map((w) => [w.id, w]));
    return memberships
      .map((m) => ({ world: worldMap.get(m.worldId), membership: m }))
      .filter(
        (r): r is { world: World; membership: WorldMembership } =>
          r.world != null,
      );
  }

  /**
   * 2.3 D-NEW-slug-check — public live availability check.
   * Vrací `true` pokud slug ještě nikdo nezabral.
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const normalized = slug.trim().toLowerCase();
    if (normalized.length < 2 || normalized.length > 40) return false;
    if (!/^[a-z0-9-]+$/.test(normalized)) return false;
    const taken = await this.worldsRepo.existsBySlug(normalized);
    return !taken;
  }

  async create(
    dto: CreateWorldDto,
    ownerId: string,
    ownerRole?: UserRole,
  ): Promise<World> {
    // 2.3 D-NEW-quota — Admin/Superadmin (role <= Admin) bez limitu;
    // ostatní max MAX_ACTIVE_WORLDS_PER_OWNER aktivních světů.
    if (ownerRole != null && ownerRole > UserRole.Admin) {
      const owned = await this.worldsRepo.findByOwnerId(ownerId);
      if (owned.length >= MAX_ACTIVE_WORLDS_PER_OWNER) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'WORLD_QUOTA_REACHED',
          message: `Dosáhl jsi limitu ${MAX_ACTIVE_WORLDS_PER_OWNER} aktivních světů.`,
        });
      }
    }

    const slugTaken = await this.worldsRepo.existsBySlug(dto.slug);
    if (slugTaken)
      throw new ConflictException({
        statusCode: 409,
        message: 'Slug již existuje',
        code: 'WORLD_SLUG_TAKEN',
      });

    const world = await this.worldsRepo.save({
      ...dto,
      slug: dto.slug.toLowerCase(),
      ownerId,
      isActive: true,
      playerCount: dto.playerCount ?? 0,
      system: dto.system ?? 'matrix',
      accessMode: dto.accessMode ?? 'private',
    });

    await this.membershipRepo.save({
      userId: ownerId,
      worldId: world.id,
      role: WorldRole.PJ,
      joinedAt: new Date(),
      akj: 0,
    });

    await this.currenciesService.seedForWorld(world.id, dto.genre);
    await this.weatherService.seedDefaultForWorld(
      world.id,
      dto.genre ?? 'other',
    );

    // Auto-seed diarySchema z preset (Krok 7d)
    const preset = this.systemPresetsService.findOne(world.system);
    await this.settingsRepo.upsert(world.id, {
      diarySchema: preset?.schema ?? [],
    });

    this.eventEmitter.emit('world.created', world);
    return world;
  }

  async update(
    id: string,
    dto: UpdateWorldDto,
    requester: RequestUser,
  ): Promise<World> {
    const world = await this.findById(id);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      id,
    );
    if (!this.canEditWorldData(requester, world, membership ?? undefined)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }

    // Krok 7d: archive + re-seed při změně system
    if (dto.system && dto.system !== world.system) {
      const settings = await this.settingsRepo.findByWorldId(id);
      if (settings && settings.diarySchema.length > 0) {
        const lastVersion = await this.diaryVersionsRepo.findLastVersion(id);
        await this.diaryVersionsRepo.create({
          worldId: id,
          version: lastVersion + 1,
          system: world.system,
          schema: settings.diarySchema,
          archivedAt: new Date(),
        });
      }
      const preset = this.systemPresetsService.findOne(dto.system);
      await this.settingsRepo.upsert(id, {
        diarySchema: preset?.schema ?? [],
      });
    }

    const updated = await this.worldsRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });

    this.eventEmitter.emit('world.updated', updated);
    return updated;
  }

  async join(
    worldId: string,
    userId: string,
    requesterName: string = '',
  ): Promise<WorldMembership> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (world.accessMode === 'closed')
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Svět je uzavřen',
      });

    const existing = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (existing) {
      if (existing.role !== WorldRole.Zadatel)
        throw new ConflictException({
          statusCode: 409,
          message: 'Již jsi členem tohoto světa',
          code: 'WORLD_ALREADY_MEMBER',
        });
      return existing; // idempotentní — žádost již odeslána, neemituj znovu
    }

    const role =
      world.accessMode === 'public' ? WorldRole.Hrac : WorldRole.Zadatel;
    const membership = await this.membershipRepo.save({
      userId,
      worldId,
      role,
      joinedAt: new Date(),
      akj: 0,
    });

    if (role === WorldRole.Hrac) {
      await this.worldsRepo.increment(worldId, 'playerCount', 1);
    }

    if (role === WorldRole.Zadatel) {
      this.eventEmitter.emit('world.join.requested', {
        worldId,
        worldName: world.name,
        requesterId: userId,
        requesterName,
      });
    }

    this.eventEmitter.emit('world.membership.changed', { worldId, membership });
    return membership;
  }

  /**
   * Spec 2.4 — PJ vlastník (nebo Admin/Superadmin) schválí žádost o vstup.
   * Atomicky promote Zadatel → Hrac + increment playerCount.
   */
  async acceptJoinRequest(
    worldId: string,
    membershipId: string,
    requester: RequestUser,
  ): Promise<{ ok: true; membership: WorldMembership }> {
    const world = await this.findById(worldId);
    this.assertCanModerateJoinRequests(world, requester);

    const m = await this.membershipRepo.findById(membershipId);
    if (!m || m.worldId !== worldId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'JOIN_REQUEST_NOT_FOUND',
        message: 'Žádost nenalezena',
      });
    if (m.role !== WorldRole.Zadatel)
      throw new BadRequestException({
        statusCode: 400,
        code: 'NOT_PENDING',
        message: 'Žádost už není pending',
      });

    const updated = await this.membershipRepo.update(membershipId, {
      role: WorldRole.Hrac,
    });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'JOIN_REQUEST_NOT_FOUND',
        message: 'Žádost nenalezena',
      });
    await this.worldsRepo.increment(worldId, 'playerCount', 1);

    this.eventEmitter.emit('world.join.accepted', {
      worldId,
      membershipId,
      userId: m.userId,
    });
    this.eventEmitter.emit('world.membership.changed', {
      worldId,
      membership: updated,
    });
    return { ok: true, membership: updated };
  }

  /**
   * Spec 2.4 — PJ vlastník (nebo Admin/Superadmin) zamítne žádost o vstup.
   * Delete pending Zadatel membership; user může poslat žádost znovu.
   */
  async rejectJoinRequest(
    worldId: string,
    membershipId: string,
    requester: RequestUser,
  ): Promise<{ ok: true }> {
    const world = await this.findById(worldId);
    this.assertCanModerateJoinRequests(world, requester);

    const m = await this.membershipRepo.findById(membershipId);
    if (!m || m.worldId !== worldId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'JOIN_REQUEST_NOT_FOUND',
        message: 'Žádost nenalezena',
      });
    if (m.role !== WorldRole.Zadatel)
      throw new BadRequestException({
        statusCode: 400,
        code: 'NOT_PENDING',
        message: 'Žádost už není pending',
      });

    const ok = await this.membershipRepo.delete(membershipId);
    if (!ok)
      throw new NotFoundException({
        statusCode: 404,
        code: 'JOIN_REQUEST_NOT_FOUND',
        message: 'Žádost nenalezena',
      });

    this.eventEmitter.emit('world.join.rejected', {
      worldId,
      membershipId,
      userId: m.userId,
    });
    return { ok: true };
  }

  private assertCanModerateJoinRequests(
    world: World,
    requester: RequestUser,
  ): void {
    const isOwner = world.ownerId === requester.id;
    const isAdmin =
      requester.role === UserRole.Superadmin ||
      requester.role === UserRole.Admin;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
  }

  async getMembers(
    worldId: string,
    filters?: { role?: number; group?: string },
  ): Promise<WorldMembership[]> {
    return this.membershipRepo.findByWorldId(worldId, filters);
  }

  async getSettings(worldId: string): Promise<WorldSettings | null> {
    return this.settingsRepo.findByWorldId(worldId);
  }

  async updateSettings(
    worldId: string,
    dto: UpdateWorldSettingsDto,
    requester: RequestUser,
  ): Promise<WorldSettings> {
    const world = await this.findById(worldId);
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!this.canAdminWorld(requester, world, membership ?? undefined)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const settings = await this.settingsRepo.upsert(worldId, dto);
    this.eventEmitter.emit('world.settings.updated', { worldId, settings });
    return settings;
  }

  async updateCalendarConfig(
    worldId: string,
    config: WorldCalendarConfig,
    requester: RequestUser,
  ): Promise<World> {
    await this.findById(worldId); // throws 404 sám
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    const allowed =
      requester.role <= UserRole.Admin ||
      (membership != null && membership.role >= WorldRole.PomocnyPJ);
    if (!allowed)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.worldsRepo.updateCalendarConfig(worldId, config);
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    this.eventEmitter.emit('world.calendarconfig.updated', { worldId, config });
    return updated;
  }

  async updateMemberRole(
    membershipId: string,
    role: WorldRole,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      membership.worldId,
    );
    if (
      !this.canManageMembers(requester, world, requesterMembership ?? undefined)
    )
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.membershipRepo.update(membershipId, { role });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    this.eventEmitter.emit('world.membership.changed', {
      worldId: membership.worldId,
      membership: updated,
    });
    return updated;
  }

  async updateMemberGroup(
    membershipId: string,
    group: string | undefined,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      membership.worldId,
    );
    if (
      !this.canManageMembers(requester, world, requesterMembership ?? undefined)
    )
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.membershipRepo.update(membershipId, { group });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    return updated;
  }

  async updateMemberCharacter(
    membershipId: string,
    characterPath: string | undefined,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    if (membership.userId !== requester.id) {
      const requesterMembership = await this.membershipRepo.findByUserAndWorld(
        requester.id,
        membership.worldId,
      );
      if (
        !this.canManageMembers(
          requester,
          world,
          requesterMembership ?? undefined,
        )
      ) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Nedostatečná oprávnění',
        });
      }
    }

    const updated = await this.membershipRepo.update(membershipId, {
      characterPath,
    });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    return updated;
  }

  async updateMemberAkj(
    membershipId: string,
    akj: number,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      membership.worldId,
    );
    if (
      !this.canManageMembers(requester, world, requesterMembership ?? undefined)
    )
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.membershipRepo.update(membershipId, { akj });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    return updated;
  }

  async updateMemberFree(
    membershipId: string,
    isFree: boolean,
    requester: RequestUser,
  ): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      membership.worldId,
    );
    if (
      !this.canManageMembers(requester, world, requesterMembership ?? undefined)
    )
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    const updated = await this.membershipRepo.update(membershipId, { isFree });
    if (!updated)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });
    return updated;
  }

  async softDelete(
    id: string,
    requester: RequestUser,
  ): Promise<{ message: string }> {
    const world = await this.findById(id);
    const requesterMembership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      id,
    );
    if (!this.canAdminWorld(requester, world, requesterMembership ?? undefined))
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    await this.worldsRepo.update(id, { isActive: false });
    this.eventEmitter.emit('world.deleted', { worldId: id });
    return { message: 'Svět byl smazán' };
  }

  async leave(
    membershipId: string,
    requester: RequestUser,
  ): Promise<{ message: string }> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Membership nenalezeno',
      });

    const world = await this.findById(membership.worldId);

    if (membership.userId !== requester.id) {
      const requesterMembership = await this.membershipRepo.findByUserAndWorld(
        requester.id,
        membership.worldId,
      );
      if (
        !this.canManageMembers(
          requester,
          world,
          requesterMembership ?? undefined,
        )
      )
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Nedostatečná oprávnění',
        });
    }

    if (membership.userId === requester.id && world.ownerId === requester.id) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Vlastník nemůže opustit svůj svět',
      });
    }

    await this.membershipRepo.delete(membershipId);

    if (membership.role === WorldRole.Hrac) {
      await this.worldsRepo.increment(membership.worldId, 'playerCount', -1);
    }

    this.eventEmitter.emit('world.membership.removed', {
      worldId: membership.worldId,
      membershipId,
    });
    return { message: 'Opustil jsi svět' };
  }

  async getDiarySchemaVersions(
    worldId: string,
    requester: RequestUser,
  ): Promise<DiarySchemaVersionMeta[]> {
    await this.assertMember(worldId, requester);
    return this.diaryVersionsRepo.findMetaByWorldId(worldId);
  }

  async getDiarySchemaVersion(
    worldId: string,
    version: number,
    requester: RequestUser,
  ): Promise<DiarySchemaVersion> {
    await this.assertMember(worldId, requester);
    const v = await this.diaryVersionsRepo.findByWorldIdAndVersion(
      worldId,
      version,
    );
    if (!v)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Verze nenalezena',
      });
    return v;
  }

  private async assertMember(
    worldId: string,
    requester: RequestUser,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        statusCode: 404,
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Nejsi členem tohoto světa',
      });
    if (membership.role < WorldRole.Hrac) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Pending členství nemá přístup',
      });
    }
  }

  private canAdminWorld(
    requester: RequestUser,
    _world: World,
    membership?: WorldMembership,
  ): boolean {
    if (requester.role <= UserRole.Admin) return true;
    if (membership && membership.role >= WorldRole.PJ) return true;
    return false;
  }

  private canManageMembers(
    requester: RequestUser,
    world: World,
    membership?: WorldMembership,
  ): boolean {
    if (this.canAdminWorld(requester, world, membership)) return true;
    if (membership && membership.role >= WorldRole.PomocnyPJ) return true;
    return false;
  }

  private canEditWorldData(
    requester: RequestUser,
    world: World,
    membership?: WorldMembership,
  ): boolean {
    if (this.canManageMembers(requester, world, membership)) return true;
    if (membership && membership.role >= WorldRole.Korektor) return true;
    return false;
  }

  // ─── Character event listeners (membership sync) ─────────────────────────

  @OnEvent('character.created')
  async onCharacterCreated(payload: {
    userId?: string;
    worldId: string;
    isNpc: boolean;
    name: string;
    imageUrl?: string;
  }): Promise<void> {
    if (payload.isNpc || !payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      payload.userId,
      payload.worldId,
    );
    if (!membership) return;
    await this.membershipRepo.update(membership.id, {
      characterPath: payload.name,
      avatarUrl: payload.imageUrl,
    });
  }

  @OnEvent('character.updated')
  async onCharacterUpdated(payload: {
    userId?: string;
    worldId: string;
    isNpc: boolean;
    name?: string;
    imageUrl?: string;
  }): Promise<void> {
    if (payload.isNpc || !payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      payload.userId,
      payload.worldId,
    );
    if (!membership) return;
    await this.membershipRepo.update(membership.id, {
      characterPath: payload.name,
      avatarUrl: payload.imageUrl,
    });
  }

  @OnEvent('character.converted')
  async onCharacterConverted(payload: {
    userId?: string;
    worldId: string;
    toNpc: boolean;
    name: string;
    imageUrl?: string;
  }): Promise<void> {
    if (!payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      payload.userId,
      payload.worldId,
    );
    if (!membership) return;
    if (payload.toNpc) {
      await this.membershipRepo.update(membership.id, {
        characterPath: undefined,
        avatarUrl: undefined,
      });
    } else {
      await this.membershipRepo.update(membership.id, {
        characterPath: payload.name,
        avatarUrl: payload.imageUrl,
      });
    }
  }
}
