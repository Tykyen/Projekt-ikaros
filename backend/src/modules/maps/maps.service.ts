import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { IMapsRepository } from './interfaces/maps-repository.interface';
import type { IMapTemplatesRepository } from './interfaces/map-templates-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { ICharactersRepository } from '../characters/interfaces/characters-repository.interface';
import type { MapScene, MapToken } from './interfaces/map-scene.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

export interface MoveTokenInput {
  id: string;
  q: number;
  r: number;
}

@Injectable()
export class MapsService {
  constructor(
    @Inject('IMapsRepository') private readonly repo: IMapsRepository,
    @Inject('IMapTemplatesRepository')
    private readonly templateRepo: IMapTemplatesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('ICharactersRepository')
    private readonly characterRepo: ICharactersRepository,
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

  async findByWorld(worldId: string): Promise<MapScene[]> {
    return this.repo.findByWorld(worldId);
  }

  async findActive(worldId: string): Promise<MapScene> {
    const scene = await this.repo.findActiveByWorld(worldId);
    if (!scene) throw new NotFoundException('Žádná aktivní scéna');
    return scene;
  }

  async findById(id: string): Promise<MapScene> {
    const scene = await this.repo.findById(id);
    if (!scene) throw new NotFoundException('Scéna nenalezena');
    return this.enrichTokens(scene);
  }

  async create(dto: Partial<MapScene>, worldId: string): Promise<MapScene> {
    let data: Partial<MapScene> = {
      ...dto,
      worldId,
      isActive: false,
      isHidden: false,
      isLocked: false,
    };

    if (dto.templateId) {
      const tpl = await this.templateRepo.findById(dto.templateId);
      if (tpl) {
        data = {
          ...data,
          config: tpl.config,
          npcTemplates: tpl.npcTemplates,
          tokens: tpl.tokens,
          effects: tpl.effects,
          fogEnabled: tpl.fogEnabled,
          revealedHexes: tpl.revealedHexes,
          activeSoundIds: tpl.activeSoundIds,
        };
      }
    }

    return this.repo.create(data);
  }

  async setActive(id: string, worldId: string): Promise<void> {
    const scene = await this.repo.findById(id);
    if (!scene) throw new NotFoundException('Scéna nenalezena');
    await this.repo.setActive(id, worldId);
  }

  async replace(id: string, dto: Partial<MapScene>): Promise<MapScene> {
    const scene = await this.repo.findById(id);
    if (!scene) throw new NotFoundException('Scéna nenalezena');
    const updated = await this.repo.replace(id, {
      ...dto,
      worldId: scene.worldId,
    });
    return this.enrichTokens(updated!);
  }

  async moveToken(
    sceneId: string,
    dto: MoveTokenInput,
    userId: string,
    userRole: UserRole,
  ): Promise<MapToken> {
    const scene = await this.repo.findById(sceneId);
    if (!scene) throw new NotFoundException('Scéna nenalezena');

    const token = scene.tokens.find((t) => t.id === dto.id);
    if (!token) throw new NotFoundException('Token nenalezen');

    const isPj = userRole <= UserRole.PJ;
    if (!isPj && token.characterId !== userId)
      throw new ForbiddenException('Nelze pohybovat cizím tokenem');

    token.q = dto.q;
    token.r = dto.r;
    await this.repo.replace(sceneId, scene);
    return token;
  }

  async removeToken(
    sceneId: string,
    tokenId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<void> {
    const scene = await this.repo.findById(sceneId);
    if (!scene) throw new NotFoundException('Scéna nenalezena');

    const token = scene.tokens.find((t) => t.id === tokenId);
    if (!token) throw new NotFoundException('Token nenalezen');

    const isPj = userRole <= UserRole.PJ;
    if (!isPj && token.characterId !== userId)
      throw new ForbiddenException('Nelze odstranit cizí token');

    scene.tokens = scene.tokens.filter((t) => t.id !== tokenId);
    await this.repo.replace(sceneId, scene);
  }

  async deleteScene(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Scéna nenalezena');
  }

  private async enrichTokens(scene: MapScene): Promise<MapScene> {
    const slugs = [
      ...new Set(
        scene.tokens.filter((t) => t.characterSlug).map((t) => t.characterSlug),
      ),
    ];
    if (slugs.length === 0) return scene;

    const results = await Promise.all(
      slugs.map(async (slug) => ({
        slug,
        char: await this.characterRepo.findBySlugAndWorld(slug, scene.worldId),
      })),
    );
    const charMap = new Map(
      results
        .filter(({ char }) => char !== null)
        .map(({ slug, char }) => [
          slug,
          {
            name: char!.name,
            imageUrl: char!.imageUrl,
            diaryData: char!.diaryData,
          },
        ]),
    );

    return {
      ...scene,
      tokens: scene.tokens.map((t) => ({
        ...t,
        characterData: charMap.get(t.characterSlug),
      })),
    };
  }
}
