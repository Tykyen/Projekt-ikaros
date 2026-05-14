import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { IDungeonMapsRepository } from './interfaces/dungeon-maps-repository.interface';
import type { DungeonMap } from './interfaces/dungeon-map.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IMapTemplatesRepository } from '../maps/interfaces/map-templates-repository.interface';
import type { IMapsRepository } from '../maps/interfaces/maps-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class DungeonMapsService {
  constructor(
    @Inject('IDungeonMapsRepository')
    private readonly repo: IDungeonMapsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IMapTemplatesRepository')
    private readonly templateRepo: IMapTemplatesRepository,
    @Inject('IMapsRepository') private readonly mapsRepo: IMapsRepository,
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

  async findByWorld(worldId: string): Promise<DungeonMap[]> {
    return this.repo.findByWorld(worldId);
  }

  async findById(id: string): Promise<DungeonMap> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    return dungeon;
  }

  async create(
    dto: Partial<DungeonMap>,
    userId: string,
    userRole: UserRole,
  ): Promise<DungeonMap> {
    await this.assertCanManage(userId, userRole, dto.worldId ?? '');
    return this.repo.create(dto);
  }

  async replace(
    id: string,
    dto: Partial<DungeonMap>,
    userId: string,
    userRole: UserRole,
  ): Promise<DungeonMap> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    await this.assertCanManage(userId, userRole, dungeon.worldId);
    const updated = await this.repo.replace(id, {
      ...dto,
      worldId: dungeon.worldId,
    });
    return updated!;
  }

  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    await this.assertCanManage(userId, userRole, dungeon.worldId);
    await this.repo.delete(id);
  }

  async exportTemplate(
    id: string,
    imageUrl: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{ templateId: string }> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    await this.assertCanManage(userId, userRole, dungeon.worldId);
    const template = await this.templateRepo.create({
      name: dungeon.name,
      imageUrl,
      config: {
        size: dungeon.cellSize,
        originX: 0,
        originY: 0,
        showGrid: true,
      },
      npcTemplates: [],
      tokens: [],
      effects: [],
      fogEnabled: false,
      revealedHexes: [],
      activeSoundIds: [],
    });
    return { templateId: template.id };
  }

  async exportScene(
    id: string,
    imageUrl: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{ sceneId: string }> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    await this.assertCanManage(userId, userRole, dungeon.worldId);
    const scene = await this.mapsRepo.create({
      name: dungeon.name,
      imageUrl,
      worldId: dungeon.worldId,
      config: {
        size: dungeon.cellSize,
        originX: 0,
        originY: 0,
        showGrid: true,
      },
      tokens: [],
      npcTemplates: [],
      effects: [],
      fogEnabled: false,
      revealedHexes: [],
      isActive: false,
      isHidden: false,
      isLocked: false,
      activeSoundIds: [],
    });
    return { sceneId: scene.id };
  }
}
