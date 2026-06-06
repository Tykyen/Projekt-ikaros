import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { IWorldMapsRepository } from './interfaces/world-maps-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { WorldMapEntry } from './interfaces/world-map.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateMapDto } from './dto/create-map.dto';
import type { UpdateMapDto } from './dto/update-map.dto';

@Injectable()
export class WorldMapsService {
  constructor(
    @Inject('IWorldMapsRepository')
    private readonly repo: IWorldMapsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  /**
   * Smí daný uživatel spravovat mapy světa? Global Admin+ NEBO world PJ.
   * (Na rozdíl od universe controlleru bere v potaz i world roli, ne jen
   * globální — jinak by world PJ dostal filtrovaný atlas.)
   */
  async canManage(
    userId: string,
    userRole: UserRole,
    worldId: string,
  ): Promise<boolean> {
    if (userRole <= UserRole.Admin) return true;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    return !!membership && membership.role >= WorldRole.PJ;
  }

  async assertCanManage(
    userId: string,
    userRole: UserRole,
    worldId: string,
  ): Promise<void> {
    if (!(await this.canManage(userId, userRole, worldId)))
      throw new ForbiddenException({
        code: 'NOT_WORLD_PJ',
        message: 'Nedostatečná oprávnění',
      });
  }

  /**
   * Seznam map světa, setříděný dle `order`. PJ/Admin dostane vše; hráč jen
   * mapy, na které má přístup (public nebo je v `visibleToPlayerIds`), a bez
   * `visibleToPlayerIds` (leak-safe — neprozradíme komu je mapa viditelná).
   */
  async list(
    worldId: string,
    userId: string | null,
    isPjOrAdmin: boolean,
  ): Promise<WorldMapEntry[]> {
    const maps = (await this.repo.findByWorld(worldId)).sort(
      (a, b) => a.order - b.order,
    );
    if (isPjOrAdmin) return maps;
    return maps
      .filter(
        (m) =>
          m.isPublic ||
          (userId !== null && m.visibleToPlayerIds.includes(userId)),
      )
      .map((m) => ({ ...m, visibleToPlayerIds: [] }));
  }

  async create(worldId: string, dto: CreateMapDto): Promise<WorldMapEntry> {
    const maps = await this.repo.findByWorld(worldId);
    const now = new Date().toISOString();
    const entry: WorldMapEntry = {
      id: randomUUID(),
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      imageUrl: dto.imageUrl,
      order: maps.length,
      isPublic: dto.isPublic ?? false,
      visibleToPlayerIds: dto.visibleToPlayerIds ?? [],
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.addMap(worldId, entry);
  }

  async update(
    worldId: string,
    mapId: string,
    dto: UpdateMapDto,
  ): Promise<WorldMapEntry> {
    const patch: Partial<WorldMapEntry> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.description !== undefined)
      patch.description = dto.description.trim();
    if (dto.imageUrl !== undefined) patch.imageUrl = dto.imageUrl;
    if (dto.isPublic !== undefined) patch.isPublic = dto.isPublic;
    if (dto.visibleToPlayerIds !== undefined)
      patch.visibleToPlayerIds = dto.visibleToPlayerIds;

    const updated = await this.repo.updateMap(worldId, mapId, patch);
    if (!updated)
      throw new NotFoundException({
        code: 'WORLD_MAP_NOT_FOUND',
        message: 'Mapa nenalezena',
      });
    return updated;
  }

  async remove(worldId: string, mapId: string): Promise<void> {
    const ok = await this.repo.removeMap(worldId, mapId);
    if (!ok)
      throw new NotFoundException({
        code: 'WORLD_MAP_NOT_FOUND',
        message: 'Mapa nenalezena',
      });
  }

  async reorder(
    worldId: string,
    orderedIds: string[],
  ): Promise<WorldMapEntry[]> {
    return this.repo.reorder(worldId, orderedIds);
  }
}
