import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUniverseRepository } from './interfaces/universe-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type {
  UniverseMap,
  UniverseNode,
  UniverseLink,
} from './interfaces/universe-map.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import {
  MATRIX_UNIVERSE_NODES,
  MATRIX_UNIVERSE_LINKS,
} from './seed/matrix-universe.seed';
import { MATRIX_WORLD_ID } from '../../database/seed/matrix-world.seed';

export interface UpdateUniverseInput {
  nodes: UniverseNode[];
  links: UniverseLink[];
}

export interface UpdateNodeVisibilityInput {
  isPublic: boolean;
  visibleToPlayerIds: string[];
}

@Injectable()
export class UniverseService {
  constructor(
    @Inject('IUniverseRepository') private readonly repo: IUniverseRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Optional() private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertCanManage(
    userId: string,
    userRole: UserRole,
    worldId: string,
  ): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PJ)
      throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findByWorld(
    worldId: string,
    userId: string | null,
    isPjOrAdmin: boolean,
  ): Promise<UniverseMap> {
    let map = await this.repo.findByWorld(worldId);

    if (!map) {
      const isMatrix = worldId === MATRIX_WORLD_ID;
      const nodes = isMatrix ? MATRIX_UNIVERSE_NODES : [];
      const links = isMatrix ? MATRIX_UNIVERSE_LINKS : [];
      map = await this.repo.upsert(worldId, nodes, links);
    }

    if (isPjOrAdmin) return map;
    return this.applyVisibilityFilter(map, userId);
  }

  async update(
    worldId: string,
    dto: UpdateUniverseInput,
  ): Promise<UniverseMap> {
    const map = await this.repo.upsert(worldId, dto.nodes, dto.links);
    this.eventEmitter?.emit('universe.updated', { worldId, map });
    return map;
  }

  async updateNodeVisibility(
    worldId: string,
    nodeId: string,
    dto: UpdateNodeVisibilityInput,
  ): Promise<UniverseMap> {
    const map = await this.repo.updateNodeVisibility(
      worldId,
      nodeId,
      dto.isPublic,
      dto.visibleToPlayerIds,
    );
    if (!map) throw new NotFoundException('Uzel nenalezen');
    this.eventEmitter?.emit('universe.updated', { worldId, map });
    return map;
  }

  private applyVisibilityFilter(
    map: UniverseMap,
    userId: string | null,
  ): UniverseMap {
    const visibleIds = new Set(
      map.nodes
        .filter(
          (n) =>
            n.isPublic ||
            (userId !== null && n.visibleToPlayerIds.includes(userId)),
        )
        .map((n) => n.id),
    );
    return {
      ...map,
      nodes: map.nodes.filter((n) => visibleIds.has(n.id)),
      links: map.links.filter(
        (l) => visibleIds.has(l.source) && visibleIds.has(l.target),
      ),
    };
  }
}
