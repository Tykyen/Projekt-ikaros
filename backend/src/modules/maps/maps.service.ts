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
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { CharacterDiaryRepository } from '../character-subdocs/repositories/character-diary.repository';
import type { MapScene, MapToken } from './interfaces/map-scene.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
    // 9.1 (cleanup) — pro enrichTokens (Page má imageUrl po sjednocení).
    @Inject('IPagesRepository')
    private readonly pagesRepo: IPagesRepository,
    // 10.2g — read-only diary subdoc pro enrichTokens (HP postavy → HP bar).
    @Inject('ICharacterDiaryRepository')
    private readonly diaryRepo: CharacterDiaryRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertCanManage(
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
    worldId: string,
  ): Promise<void> {
    if (await this.canManageWorld(requester, worldId)) return;
    throw new ForbiddenException({
      code: 'MAP_FORBIDDEN',
      message: 'Nedostatečná oprávnění',
    });
  }

  /**
   * D-053b — predikát pro membership-based check.
   * Platform Admin/Superadmin projde jen s aktivní elevací pro daný svět
   * (worldAdminBypass); jinak musí mít world membership ≥ PJ v *konkrétním*
   * světě dané scény. Používá se v `moveToken`/`removeToken` jako bypass na
   * else-větvi (token ownership check).
   */
  private async canManageWorld(
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
    worldId: string,
  ): Promise<boolean> {
    if (worldAdminBypass(requester, worldId)) return true;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    return !!membership && membership.role >= WorldRole.PJ;
  }

  /**
   * R-11 — orchestrator read (všechny / aktivní scény) = staff-only (PomocnyPJ+
   * || GlobalAdmin). Dřív byl HTTP endpoint BEZ guardu → anonymní dump celé
   * taktické mapy (HP/fog/pozice/kostky). Per-hráč scéna (`findActiveForUser`)
   * zůstává členská přes `currentSceneId`.
   */
  private async assertStaff(
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
    worldId: string,
  ): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ)
      throw new ForbiddenException({
        code: 'MAP_FORBIDDEN',
        message: 'Scény světa smí číst jen PJ / pomocný PJ.',
      });
  }

  async findByWorld(
    worldId: string,
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
  ): Promise<MapScene[]> {
    await this.assertStaff(requester, worldId);
    return this.repo.findByWorld(worldId);
  }

  /**
   * 10.2-prep-1 — list jen aktivních scén ve světě (PJ orchestrator panel).
   * Uvolněná `isActive` semantika dovoluje víc paralelně aktivních scén.
   */
  async findActiveScenes(
    worldId: string,
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
  ): Promise<MapScene[]> {
    await this.assertStaff(requester, worldId);
    return this.repo.findActiveScenesByWorld(worldId);
  }

  /**
   * 10.2-prep-1 — per-user scene resolution.
   *
   * Server vrátí scénu dle `WorldMembership.currentSceneId` daného uživatele
   * (ne „first isActive" jako dřív). Klient tak vidí jen tu scénu, kterou mu
   * PJ přiřadil. PJ může self-assign na libovolnou aktivní scénu
   * (orchestrator panel).
   *
   * @throws NotFoundException MAP_NO_ACTIVE_SCENE — hráč není nikam přiřazený
   *   nebo přiřazená scéna byla smazána (klient zobrazí empty state).
   */
  async findActiveForUser(worldId: string, userId: string): Promise<MapScene> {
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (!membership?.currentSceneId) {
      throw new NotFoundException({
        code: 'MAP_NO_ACTIVE_SCENE',
        message: 'PJ ti ještě nepřiřadil scénu',
      });
    }
    const scene = await this.repo.findById(membership.currentSceneId);
    if (!scene) {
      throw new NotFoundException({
        code: 'MAP_NO_ACTIVE_SCENE',
        message: 'Přiřazená scéna byla smazána',
      });
    }
    return this.enrichTokens(scene);
  }

  /**
   * @deprecated 10.2-prep-1 — použij `findActiveForUser(worldId, userId)`.
   * Zachováno pro backward compat se starým chováním "první isActive scéna".
   */
  async findActive(worldId: string): Promise<MapScene> {
    const scene = await this.repo.findActiveByWorld(worldId);
    if (!scene)
      throw new NotFoundException({
        code: 'MAP_NO_ACTIVE_SCENE',
        message: 'Žádná aktivní scéna',
      });
    return scene;
  }

  async findById(id: string): Promise<MapScene> {
    const scene = await this.repo.findById(id);
    if (!scene)
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
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
    if (!scene)
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
    await this.repo.setActive(id, worldId);
  }

  async replace(id: string, dto: Partial<MapScene>): Promise<MapScene> {
    const scene = await this.repo.findById(id);
    if (!scene)
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
    const updated = await this.repo.replace(id, {
      ...dto,
      worldId: scene.worldId,
    });
    return this.enrichTokens(updated!);
  }

  async moveToken(
    sceneId: string,
    dto: MoveTokenInput,
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
  ): Promise<MapToken> {
    const scene = await this.repo.findById(sceneId);
    if (!scene)
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });

    const token = scene.tokens.find((t) => t.id === dto.id);
    if (!token)
      throw new NotFoundException({
        code: 'MAP_TOKEN_NOT_FOUND',
        message: 'Token nenalezen',
      });

    // D-053b — membership-based check. PJ daného světa povolen; jinak musí
    // hýbat jen vlastním tokenem (charakter own=requester.id).
    const canManage = await this.canManageWorld(requester, scene.worldId);
    if (!canManage && token.characterId !== requester.id)
      throw new ForbiddenException({
        code: 'MAP_TOKEN_NOT_OWNER',
        message: 'Nelze pohybovat cizím tokenem',
      });

    // 10.2-prep-2 — atomic Mongo positional update místo full replace.
    // Bez tohoto: souběžný PJ move + hráč update token by ztratil jeden z edits
    // (race klassik). S positional `tokens.$.q/.r` updateOne atomic na úrovni DB.
    const result = await this.repo.atomicUpdate(
      { _id: sceneId, 'tokens.id': dto.id },
      {
        $set: {
          'tokens.$.q': dto.q,
          'tokens.$.r': dto.r,
          lastModified: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) {
      throw new NotFoundException({
        code: 'MAP_TOKEN_NOT_FOUND',
        message: 'Token mezitím zmizel ze scény',
      });
    }
    token.q = dto.q;
    token.r = dto.r;
    return token;
  }

  async removeToken(
    sceneId: string,
    tokenId: string,
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
  ): Promise<void> {
    const scene = await this.repo.findById(sceneId);
    if (!scene)
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });

    const token = scene.tokens.find((t) => t.id === tokenId);
    if (!token)
      throw new NotFoundException({
        code: 'MAP_TOKEN_NOT_FOUND',
        message: 'Token nenalezen',
      });

    // D-053b — membership-based check (viz `moveToken`).
    const canManage = await this.canManageWorld(requester, scene.worldId);
    if (!canManage && token.characterId !== requester.id)
      throw new ForbiddenException({
        code: 'MAP_TOKEN_NOT_OWNER',
        message: 'Nelze odstranit cizí token',
      });

    // 10.2-prep-2 — atomic $pull místo full replace (race-safe).
    await this.repo.atomicUpdate(
      { _id: sceneId },
      {
        $pull: { tokens: { id: tokenId } },
        $set: { lastModified: new Date() },
      },
    );
  }

  async deleteScene(id: string): Promise<void> {
    const scene = await this.repo.findById(id);
    const deleted = await this.repo.delete(id);
    if (!deleted)
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
    // CD-04 (cascade-delete audit) — vyčistit dangling `currentSceneId` u členů,
    // kteří na smazané scéně byli (jinak uvíznou na neexistující scéně).
    await this.membershipRepo.clearSceneForAll(id);
    // UM-05 — úklid blobu pozadí smazané scény (tokeny berou obrázek z Page,
    // vlastní blob nemají).
    if (scene?.imageUrl) {
      this.eventEmitter.emit('media.orphaned', { urls: [scene.imageUrl] });
    }
  }

  private async enrichTokens(scene: MapScene): Promise<MapScene> {
    const slugs = [
      ...new Set(
        scene.tokens.filter((t) => t.characterSlug).map((t) => t.characterSlug),
      ),
    ];
    if (slugs.length === 0) return scene;

    // 9.1 (cleanup) — imageUrl bere z Page (po sjednocení Character→Page),
    // name + diaryData z Character (subdoc kontejner). Page lookup přes slug
    // (Page.slug === Character.slug po sjednocení).
    const results = await Promise.all(
      slugs.map(async (slug) => {
        const char = await this.characterRepo.findBySlugAndWorld(
          slug,
          scene.worldId,
        );
        const page = await this.pagesRepo.findBySlugAndWorld(
          slug,
          scene.worldId,
        );
        // 10.2g — HP postavy (PC/NPC) žije v diary subdocu (customData), ne na
        // core Character. Read-only (findByCharacterId nevytváří) → token bez
        // diáře prostě HP bar nedostane.
        const diary = char
          ? await this.diaryRepo.findByCharacterId(char.id)
          : null;
        return { slug, char, page, diary };
      }),
    );
    const charMap = new Map(
      results
        .filter(({ char }) => char !== null)
        .map(({ slug, char, page, diary }) => [
          slug,
          {
            name: char!.name,
            imageUrl: page?.imageUrl,
            diaryData: char!.diaryData,
            // 10.2g — diary subdoc customData (per-system HP klíče); FE
            // `resolveCharacterHp` z toho čte HP bar pro PC/NPC.
            customData: diary?.customData ?? {},
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
