import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
    const existing = await this.worldsRepo.findBySlug(dto.slug);
    if (existing) throw new ConflictException('Slug již existuje');

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

    const currencies = this.getCurrenciesForGenre(dto.genre);
    await this.settingsRepo.upsert(world.id, { currencies });

    this.eventEmitter.emit('world.created', world);
    return world;
  }

  async update(id: string, dto: UpdateWorldDto, requester: RequestUser): Promise<World> {
    const world = await this.findById(id);
    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, id);
    if (!this.canManageWorld(requester, world, membership ?? undefined)) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }

    const updated = await this.worldsRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Svět nenalezen');

    this.eventEmitter.emit('world.updated', updated);
    return updated;
  }

  async join(worldId: string, userId: string): Promise<WorldMembership> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    if (world.accessMode === 'closed') throw new ForbiddenException('Svět je uzavřen');

    const existing = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (existing && existing.role !== WorldRole.Pending) {
      throw new ConflictException('Již jsi členem tohoto světa');
    }

    const role = world.accessMode === 'public' ? WorldRole.Hrac : WorldRole.Pending;
    let membership: WorldMembership;
    try {
      membership = await this.membershipRepo.save({
        userId,
        worldId,
        role,
        joinedAt: new Date(),
        akj: 0,
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) throw new ConflictException('Již jsi členem tohoto světa');
      throw err;
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
    if (!this.canManageWorld(requester, world, membership ?? undefined)) {
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
    if (!this.canManageWorld(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');

    const updated = await this.membershipRepo.update(membershipId, { role });
    if (!updated) throw new NotFoundException('Membership nenalezeno');

    this.eventEmitter.emit('world.membership.changed', { worldId: membership.worldId, membership: updated });
    return updated;
  }

  async updateMemberGroup(membershipId: string, group: string | undefined, requester: RequestUser): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership nenalezeno');

    const world = await this.findById(membership.worldId);
    if (!this.canManageWorld(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');

    const updated = await this.membershipRepo.update(membershipId, { group });
    if (!updated) throw new NotFoundException('Membership nenalezeno');
    return updated;
  }

  async updateMemberAkj(membershipId: string, akj: number, requester: RequestUser): Promise<WorldMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership nenalezeno');

    const world = await this.findById(membership.worldId);
    if (!this.canManageWorld(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');

    const updated = await this.membershipRepo.update(membershipId, { akj });
    if (!updated) throw new NotFoundException('Membership nenalezeno');
    return updated;
  }

  async softDelete(id: string, requester: RequestUser): Promise<{ message: string }> {
    const world = await this.findById(id);
    if (!this.canManageWorld(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');
    await this.worldsRepo.update(id, { isActive: false });
    this.eventEmitter.emit('world.deleted', { worldId: id });
    return { message: 'Svět byl smazán' };
  }

  async leave(membershipId: string, requester: RequestUser): Promise<{ message: string }> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership nenalezeno');

    const world = await this.findById(membership.worldId);

    if (membership.userId !== requester.id) {
      if (!this.canManageWorld(requester, world)) throw new ForbiddenException('Nedostatečná oprávnění');
    }

    if (membership.userId === requester.id && world.ownerId === requester.id) {
      throw new BadRequestException('Vlastník nemůže opustit svůj svět');
    }

    await this.membershipRepo.delete(membershipId);
    this.eventEmitter.emit('world.membership.removed', { worldId: membership.worldId, membershipId });
    return { message: 'Opustil jsi svět' };
  }

  private canManageWorld(requester: RequestUser, world: World, membership?: WorldMembership): boolean {
    if (requester.id === world.ownerId) return true;
    if (requester.role <= UserRole.Admin) return true;
    if (membership && membership.role >= WorldRole.PomocnyPJ) return true;
    return false;
  }

  private getCurrenciesForGenre(genre?: string): WorldSettings['currencies'] {
    const id = () => Math.random().toString(36).slice(2);
    const fantasy = ['fantasy', 'dark-fantasy', 'heroic-fantasy', 'sword-sorcery', 'grimdark', 'mytologicky'];
    const cyber = ['cyberpunk', 'sci-fi', 'hard-sci-fi', 'soft-sci-fi', 'biopunk'];
    const space = ['space-opera', 'military'];
    const postapo = ['postapo', 'post-postapo', 'dieselpunk'];

    if (genre && fantasy.includes(genre)) {
      return [
        { id: id(), code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 },
        { id: id(), code: 'ST', name: 'Stříbrňák', symbol: 'St', rate: 0.1 },
        { id: id(), code: 'MD', name: 'Měďák', symbol: 'Md', rate: 0.01 },
      ];
    }
    if (genre && cyber.includes(genre)) {
      return [
        { id: id(), code: 'CR', name: 'Kredit', symbol: 'Cr', rate: 1.0 },
        { id: id(), code: 'NUSD', name: 'NUSA Dolar', symbol: '$', rate: 2.5 },
      ];
    }
    if (genre && space.includes(genre)) {
      return [
        { id: id(), code: 'CR', name: 'Kredit', symbol: 'Cr', rate: 1.0 },
        { id: id(), code: 'KR', name: 'Krystal', symbol: 'Kr', rate: 100.0 },
      ];
    }
    if (genre && postapo.includes(genre)) {
      return [
        { id: id(), code: 'ZAT', name: 'Zátka', symbol: 'Zt', rate: 1.0 },
        { id: id(), code: 'PR', name: 'Příděl', symbol: 'Př', rate: 50.0 },
      ];
    }
    return [{ id: id(), code: 'MNC', name: 'Mince', symbol: 'Mn', rate: 1.0 }];
  }
}
