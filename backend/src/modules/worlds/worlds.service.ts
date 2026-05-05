import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { IWorldsRepository } from './interfaces/worlds-repository.interface';
import type { IWorldMembershipRepository } from './interfaces/world-membership-repository.interface';
import type { IWorldSettingsRepository } from './interfaces/world-settings-repository.interface';
import { World } from './interfaces/world.interface';
import { WorldMembership, WorldRole } from './interfaces/world-membership.interface';
import { WorldSettings } from './interfaces/world-settings.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateWorldDto } from './dto/create-world.dto';
import { UpdateWorldDto } from './dto/update-world.dto';
import { UpdateWorldSettingsDto } from './dto/update-world-settings.dto';
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';

export interface RequestUser {
  id: string;
  role: UserRole;
  username: string;
}

@Injectable()
export class WorldsService {
  constructor(
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldSettingsRepository') private readonly settingsRepo: IWorldSettingsRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly currenciesService: WorldCurrenciesService,
  ) {}

  async findAll(): Promise<World[]> {
    return this.worldsRepo.findAll();
  }

  async findById(id: string): Promise<World> {
    const world = await this.worldsRepo.findById(id);
    if (!world) throw new NotFoundException('Svět nenalezen');
    return world;
  }

  async findBySlug(slug: string): Promise<World> {
    const world = await this.worldsRepo.findBySlug(slug);
    if (!world) throw new NotFoundException('Svět nenalezen');
    return world;
  }

  async findMyWorlds(userId: string): Promise<{ world: World; membership: WorldMembership }[]> {
    const memberships = await this.membershipRepo.findByUserId(userId);
    if (memberships.length === 0) return [];
    const worldIds = memberships.map((m) => m.worldId);
    const worlds = await this.worldsRepo.findByIds(worldIds);
    const worldMap = new Map(worlds.map((w) => [w.id, w]));
    return memberships
      .map((m) => ({ world: worldMap.get(m.worldId), membership: m }))
      .filter((r): r is { world: World; membership: WorldMembership } => r.world != null);
  }

  async create(dto: CreateWorldDto, ownerId: string): Promise<World> {
    const slugTaken = await this.worldsRepo.existsBySlug(dto.slug);
    if (slugTaken) throw new ConflictException('Slug již existuje');

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

    this.eventEmitter.emit('world.created', world);
    return world;
  }

  async update(id: string, dto: UpdateWorldDto, requester: RequestUser): Promise<World> {
    const world = await this.findById(id);
    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, id);
    if (!this.canEditWorldData(requester, world, membership ?? undefined)) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }

    const updated = await this.worldsRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Svět nenalezen');

    this.eventEmitter.emit('world.updated', updated);
    return updated;
  }

  async join(worldId: string, userId: string, requesterName: string = ''): Promise<WorldMembership> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    if (world.accessMode === 'closed') throw new ForbiddenException('Svět je uzavřen');

    const existing = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (existing) {
      if (existing.role !== WorldRole.Pending) throw new ConflictException('Již jsi členem tohoto světa');
      return existing; // idempotentní — žádost již odeslána, neemituj znovu
    }

    const role = world.accessMode === 'public' ? WorldRole.Hrac : WorldRole.Pending;
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

    if (role === WorldRole.Pending) {
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

  async getMembers(worldId: string): Promise<WorldMembership[]> {
    return this.membershipRepo.findByWorldId(worldId);
  }

  async getSettings(worldId: string): Promise<WorldSettings | null> {
    return this.settingsRepo.findByWorldId(worldId);
  }

  async updateSettings(worldId: string, dto: UpdateWorldSettingsDto, requester: RequestUser): Promise<WorldSettings> {
    const world = await this.findById(worldId);
    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
    if (!this.canAdminWorld(requester, world, membership ?? undefined)) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const settings = await this.settingsRepo.upsert(worldId, dto);
    this.eventEmitter.emit('world.settings.updated', { worldId, settings });
    return settings;
  }

  async updateMemberRole(membershipId: string, role: WorldRole, requester: RequestUser): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership nenalezeno');

    const world = await this.findById(membership.worldId);
    if (!this.canManageMembers(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');

    const updated = await this.membershipRepo.update(membershipId, { role });
    if (!updated) throw new NotFoundException('Membership nenalezeno');

    this.eventEmitter.emit('world.membership.changed', { worldId: membership.worldId, membership: updated });
    return updated;
  }

  async updateMemberGroup(membershipId: string, group: string | undefined, requester: RequestUser): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership nenalezeno');

    const world = await this.findById(membership.worldId);
    if (!this.canManageMembers(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');

    const updated = await this.membershipRepo.update(membershipId, { group });
    if (!updated) throw new NotFoundException('Membership nenalezeno');
    return updated;
  }

  async updateMemberCharacter(membershipId: string, characterPath: string | undefined, requester: RequestUser): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership nenalezeno');

    const world = await this.findById(membership.worldId);
    if (membership.userId !== requester.id && !this.canManageMembers(requester, world)) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }

    const updated = await this.membershipRepo.update(membershipId, { characterPath });
    if (!updated) throw new NotFoundException('Membership nenalezeno');
    return updated;
  }

  async updateMemberAkj(membershipId: string, akj: number, requester: RequestUser): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership nenalezeno');

    const world = await this.findById(membership.worldId);
    if (!this.canManageMembers(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');

    const updated = await this.membershipRepo.update(membershipId, { akj });
    if (!updated) throw new NotFoundException('Membership nenalezeno');
    return updated;
  }

  async updateMemberFree(membershipId: string, isFree: boolean, requester: RequestUser): Promise<WorldMembership | null> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Členství nenalezeno');
    if (requester.role > UserRole.PJ && membership.worldId !== undefined) {
      const worldMembership = await this.membershipRepo.findByUserAndWorld(requester.id, membership.worldId);
      if (!worldMembership || worldMembership.role < WorldRole.PJ) {
        throw new ForbiddenException('Pouze PJ může měnit isFree');
      }
    }
    return this.membershipRepo.update(membershipId, { isFree });
  }

  async softDelete(id: string, requester: RequestUser): Promise<{ message: string }> {
    const world = await this.findById(id);
    if (!this.canAdminWorld(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');
    await this.worldsRepo.update(id, { isActive: false });
    this.eventEmitter.emit('world.deleted', { worldId: id });
    return { message: 'Svět byl smazán' };
  }

  async leave(membershipId: string, requester: RequestUser): Promise<{ message: string }> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership nenalezeno');

    const world = await this.findById(membership.worldId);

    if (membership.userId !== requester.id) {
      if (!this.canManageMembers(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');
    }

    if (membership.userId === requester.id && world.ownerId === requester.id) {
      throw new BadRequestException('Vlastník nemůže opustit svůj svět');
    }

    await this.membershipRepo.delete(membershipId);

    if (membership.role === WorldRole.Hrac) {
      await this.worldsRepo.increment(membership.worldId, 'playerCount', -1);
    }

    this.eventEmitter.emit('world.membership.removed', { worldId: membership.worldId, membershipId });
    return { message: 'Opustil jsi svět' };
  }

  private canAdminWorld(requester: RequestUser, world: World, membership?: WorldMembership): boolean {
    if (requester.id === world.ownerId) return true;
    if (requester.role <= UserRole.Admin) return true;
    if (membership && membership.role >= WorldRole.PJ) return true;
    return false;
  }

  private canManageMembers(requester: RequestUser, world: World, membership?: WorldMembership): boolean {
    if (this.canAdminWorld(requester, world, membership)) return true;
    if (membership && membership.role >= WorldRole.PomocnyPJ) return true;
    return false;
  }

  private canEditWorldData(requester: RequestUser, world: World, membership?: WorldMembership): boolean {
    if (this.canManageMembers(requester, world, membership)) return true;
    if (membership && membership.role >= WorldRole.Korektor) return true;
    return false;
  }

  // ─── Character event listeners (membership sync) ─────────────────────────

  @OnEvent('character.created')
  async onCharacterCreated(payload: { userId?: string; worldId: string; isNpc: boolean; name: string; imageUrl?: string }): Promise<void> {
    if (payload.isNpc || !payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(payload.userId, payload.worldId);
    if (!membership) return;
    await this.membershipRepo.update(membership.id, { characterPath: payload.name, avatarUrl: payload.imageUrl });
  }

  @OnEvent('character.updated')
  async onCharacterUpdated(payload: { userId?: string; worldId: string; isNpc: boolean; name?: string; imageUrl?: string }): Promise<void> {
    if (payload.isNpc || !payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(payload.userId, payload.worldId);
    if (!membership) return;
    await this.membershipRepo.update(membership.id, { characterPath: payload.name, avatarUrl: payload.imageUrl });
  }

  @OnEvent('character.converted')
  async onCharacterConverted(payload: { userId?: string; worldId: string; toNpc: boolean; name: string; imageUrl?: string }): Promise<void> {
    if (!payload.userId) return;
    const membership = await this.membershipRepo.findByUserAndWorld(payload.userId, payload.worldId);
    if (!membership) return;
    if (payload.toNpc) {
      await this.membershipRepo.update(membership.id, { characterPath: undefined, avatarUrl: undefined });
    } else {
      await this.membershipRepo.update(membership.id, { characterPath: payload.name, avatarUrl: payload.imageUrl });
    }
  }

}
