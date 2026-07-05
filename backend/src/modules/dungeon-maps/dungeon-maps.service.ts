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
import { worldAdminBypass } from '../../common/utils/world-elevation';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

type Requester = Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>;

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

  async assertCanManage(requester: Requester, worldId: string): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PJ)
      throw new ForbiddenException({
        code: 'NOT_WORLD_PJ',
        message: 'Nedostatečná oprávnění',
      });
  }

  async findByWorld(
    worldId: string,
    requester: Requester,
  ): Promise<DungeonMap[]> {
    // R-12 — read-gate stejný jako write (PJ): dungeon je PJ prep obsah.
    await this.assertCanManage(requester, worldId);
    return this.repo.findByWorld(worldId);
  }

  async findById(id: string, requester: Requester): Promise<DungeonMap> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon)
      throw new NotFoundException({
        code: 'DUNGEON_NOT_FOUND',
        message: 'Dungeon nenalezen',
      });
    await this.assertCanManage(requester, dungeon.worldId);
    return dungeon;
  }

  async create(
    dto: Partial<DungeonMap>,
    requester: Requester,
  ): Promise<DungeonMap> {
    await this.assertCanManage(requester, dto.worldId ?? '');
    return this.repo.create(dto);
  }

  async replace(
    id: string,
    dto: Partial<DungeonMap>,
    requester: Requester,
  ): Promise<DungeonMap> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon)
      throw new NotFoundException({
        code: 'DUNGEON_NOT_FOUND',
        message: 'Dungeon nenalezen',
      });
    await this.assertCanManage(requester, dungeon.worldId);
    const updated = await this.repo.replace(id, {
      ...dto,
      worldId: dungeon.worldId,
    });
    return updated!;
  }

  async delete(id: string, requester: Requester): Promise<void> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon)
      throw new NotFoundException({
        code: 'DUNGEON_NOT_FOUND',
        message: 'Dungeon nenalezen',
      });
    await this.assertCanManage(requester, dungeon.worldId);
    await this.repo.delete(id);
  }

  async exportTemplate(
    id: string,
    imageUrl: string,
    requester: Requester,
  ): Promise<{ templateId: string }> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon)
      throw new NotFoundException({
        code: 'DUNGEON_NOT_FOUND',
        message: 'Dungeon nenalezen',
      });
    await this.assertCanManage(requester, dungeon.worldId);
    const template = await this.templateRepo.create({
      name: dungeon.name,
      imageUrl,
      // FIX-10 — MapTemplateSchema má `ownerId` required; bez něj create
      // padal na Mongoose validaci (dungeon export šablony byl nefunkční).
      ownerId: requester.id,
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
    requester: Requester,
  ): Promise<{ sceneId: string }> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon)
      throw new NotFoundException({
        code: 'DUNGEON_NOT_FOUND',
        message: 'Dungeon nenalezen',
      });
    await this.assertCanManage(requester, dungeon.worldId);
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
