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
import { UsersService } from '../users/users.service';
import { isEffectiveSupporter } from '../users/supporter.util';

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
    // 21.3a — kvůli `isSupporter` (gating Podporovatel, vzor worlds.service).
    private readonly usersService: UsersService,
  ) {}

  /** World role requestera, nebo null pro non-membera. */
  private async membershipRole(
    requester: Requester,
    worldId: string,
  ): Promise<WorldRole | null> {
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    return membership ? membership.role : null;
  }

  /** PJ+ (exporty na taktickou mapu, správa cizích podzemí). */
  async assertCanManage(requester: Requester, worldId: string): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const role = await this.membershipRole(requester, worldId);
    if (role === null || role < WorldRole.PJ)
      throw new ForbiddenException({
        code: 'NOT_WORLD_PJ',
        message: 'Tohle smí jen Pán jeskyně světa.',
      });
  }

  /**
   * 21.3a — tvorba podzemí: člen světa Hrac+ ∧ (PJ+ ∨ Podporovatel).
   * Vrací roli pro další rozhodování.
   */
  private async assertCanCreate(
    requester: Requester,
    worldId: string,
  ): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const role = await this.membershipRole(requester, worldId);
    if (role === null || role < WorldRole.Hrac)
      throw new ForbiddenException({
        code: 'NOT_WORLD_MEMBER',
        message: 'Tvorba podzemí je pro hráče tohoto světa.',
      });
    if (role >= WorldRole.PJ) return;
    const user = await this.usersService
      .findById(requester.id)
      .catch(() => null);
    if (!user || !isEffectiveSupporter(user.role, user.isSupporter))
      throw new ForbiddenException({
        code: 'NOT_SUPPORTER',
        message:
          'Tvorba podzemí je výhoda Podporovatelů. Podpoř projekt a stavěj vlastní jeskyně.',
      });
  }

  /**
   * 21.3a — úprava/smazání: PJ+ ∨ vlastník (Hrac+). Vlastník bez aktivního
   * Podporovatele svoje existující podzemí edituje dál (grandfathering, vzor
   * 19.4 limitu světů — blokuje se jen NOVÁ tvorba). Legacy dokumenty bez
   * ownerId = PJ-owned.
   */
  private async assertCanEdit(
    requester: Requester,
    dungeon: DungeonMap,
  ): Promise<void> {
    if (worldAdminBypass(requester, dungeon.worldId)) return;
    const role = await this.membershipRole(requester, dungeon.worldId);
    if (role !== null && role >= WorldRole.PJ) return;
    if (
      role !== null &&
      role >= WorldRole.Hrac &&
      dungeon.ownerId === requester.id
    )
      return;
    throw new ForbiddenException({
      code: 'NOT_DUNGEON_OWNER',
      message: 'Tohle podzemí patří jinému staviteli.',
    });
  }

  async findByWorld(
    worldId: string,
    requester: Requester,
  ): Promise<DungeonMap[]> {
    if (worldAdminBypass(requester, worldId))
      return this.repo.findByWorld(worldId);
    const role = await this.membershipRole(requester, worldId);
    // R-12 → 21.3a — read-gate: Hrac+ (dřív PJ-only). PJ+ vidí všechna
    // podzemí světa, hráč jen svoje (cizí rozpracované jeskyně = PJ prep).
    if (role === null || role < WorldRole.Hrac)
      throw new ForbiddenException({
        code: 'NOT_WORLD_MEMBER',
        message: 'Tvorba podzemí je pro hráče tohoto světa.',
      });
    if (role >= WorldRole.PJ) return this.repo.findByWorld(worldId);
    return this.repo.findByWorld(worldId, requester.id);
  }

  async findById(id: string, requester: Requester): Promise<DungeonMap> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon)
      throw new NotFoundException({
        code: 'DUNGEON_NOT_FOUND',
        message: 'Dungeon nenalezen',
      });
    // Detail cizího podzemí jen PJ+ (stejná hranice jako edit).
    await this.assertCanEdit(requester, dungeon);
    return dungeon;
  }

  async create(
    dto: Partial<DungeonMap>,
    requester: Requester,
  ): Promise<DungeonMap> {
    await this.assertCanCreate(requester, dto.worldId ?? '');
    // ownerId server-enforced — DTO ho nepřijímá (vzor MapTemplate).
    return this.repo.create({ ...dto, ownerId: requester.id });
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
    await this.assertCanEdit(requester, dungeon);
    const updated = await this.repo.replace(id, {
      ...dto,
      worldId: dungeon.worldId,
      // replace jede overwrite — bez explicitního ownerId by se vlastník ztratil.
      ownerId: dungeon.ownerId,
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
    await this.assertCanEdit(requester, dungeon);
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
