import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../users/interfaces/user.interface';
import { WorldRole } from '../../worlds/interfaces/world-membership.interface';
import type { IWorldMembershipRepository } from '../../worlds/interfaces/world-membership-repository.interface';
import type { MapScene } from '../interfaces/map-scene.interface';
import type { MapOperationPayload } from '../dto/operations';
import type { WorldOperationPayload } from '../../worlds/dto/operations';

/**
 * 10.2-prep-1 — kontext autorizovaného requestu (z JwtAuthGuard).
 *
 * `role` = globální `UserRole` (1=Sa, 2=Admin, ostatní). PJ status per-svět
 * je zvlášť přes `WorldMembership.role >= WorldRole.PJ` — viz memory
 * `feedback_platform_vs_world_roles`.
 */
export interface OperationRequestUser {
  id: string;
  role: UserRole;
}

/**
 * 10.2-prep-1 — centrální autorizační vrstva pro operations API.
 *
 * Matice:
 * - per-scene ops: viz docs/arch/maps/operations/security.md § Matice oprávnění
 * - cross-scene ops: viz security.md § Cross-scene ops
 *
 * Jedno místo, kde se rozhoduje, kdo smí co. `MapOperationsService` a
 * `WorldOperationsService` volají před každou apply.
 */
@Injectable()
export class OperationsAuthorizer {
  constructor(
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  /**
   * Per-scene op autorizace. `scene` je už načtená (caller potřebuje pro inverse).
   *
   * @throws ForbiddenException MAP_OP_FORBIDDEN — neoprávněn
   * @throws NotFoundException MAP_TOKEN_NOT_FOUND — referencovaný token chybí
   *   (rolling do MAP_OP_FORBIDDEN by leak existenci tokenu; ale tento case
   *   server také testuje v apply, takže je OK ho odhalit zde brzy)
   */
  async assertCanDo(
    user: OperationRequestUser,
    scene: MapScene,
    op: MapOperationPayload,
  ): Promise<void> {
    // 1. Global Sa/Admin bypass
    if (user.role <= UserRole.Admin) return;

    // 2. Membership ve světě scény
    const membership = await this.membershipRepo.findByUserAndWorld(
      user.id,
      scene.worldId,
    );
    if (!membership) {
      throw new ForbiddenException({
        code: 'MAP_OP_FORBIDDEN',
        message: 'Nejsi member tohoto světa',
      });
    }
    // 10.2-prep-1 — práh `>= PomocnyPJ` (4) — asistent PJ taky smí řídit mapu.
    // Korektor (3) je čistě obsahový workflow, ne taktická vrstva.
    const isWorldPJ = membership.role >= WorldRole.PomocnyPJ;
    if (isWorldPJ) return;

    // 3. Hráč — per op typ
    switch (op.type) {
      case 'token.move': {
        const token = scene.tokens.find((t) => t.id === op.tokenId);
        if (!token) {
          throw new NotFoundException({
            code: 'MAP_TOKEN_NOT_FOUND',
            message: 'Token nenalezen',
          });
        }
        if (token.characterId !== user.id) {
          throw new ForbiddenException({
            code: 'MAP_OP_FORBIDDEN',
            message: 'Nelze pohybovat cizím tokenem',
          });
        }
        if (scene.isLocked) {
          throw new ForbiddenException({
            code: 'MAP_OP_FORBIDDEN',
            message: 'Mapa je zamčená',
          });
        }
        return;
      }
      case 'token.remove': {
        const token = scene.tokens.find((t) => t.id === op.tokenId);
        if (!token) {
          throw new NotFoundException({
            code: 'MAP_TOKEN_NOT_FOUND',
            message: 'Token nenalezen',
          });
        }
        if (token.characterId !== user.id) {
          throw new ForbiddenException({
            code: 'MAP_OP_FORBIDDEN',
            message: 'Nelze odstranit cizí token',
          });
        }
        return;
      }
      case 'token.update': {
        const token = scene.tokens.find((t) => t.id === op.tokenId);
        if (!token) {
          throw new NotFoundException({
            code: 'MAP_TOKEN_NOT_FOUND',
            message: 'Token nenalezen',
          });
        }
        if (token.characterId !== user.id) {
          throw new ForbiddenException({
            code: 'MAP_OP_FORBIDDEN',
            message: 'Nelze upravit cizí token',
          });
        }
        // Hráč může patchovat jen `currentHp` a `injury` (security.md § token.update)
        const allowedPlayerFields = new Set(['currentHp', 'injury']);
        const patchKeys = Object.keys(op.patch);
        const forbidden = patchKeys.filter((k) => !allowedPlayerFields.has(k));
        if (forbidden.length > 0) {
          throw new ForbiddenException({
            code: 'MAP_OP_FORBIDDEN',
            message: `Hráč může editovat jen vlastní HP/zranění (zakázáno: ${forbidden.join(', ')})`,
          });
        }
        return;
      }
      default:
        throw new ForbiddenException({
          code: 'MAP_OP_FORBIDDEN',
          message: 'Tato operace je PJ-only',
        });
    }
  }

  /**
   * Cross-scene op autorizace (worldOperations).
   *
   * Hráč může jen `member.unassign` self-call (graceful leave). Vše ostatní
   * je PJ-only.
   *
   * @throws ForbiddenException MAP_OP_FORBIDDEN
   */
  async assertCanDoWorldOp(
    user: OperationRequestUser,
    worldId: string,
    op: WorldOperationPayload,
  ): Promise<void> {
    // 1. Sa/Admin bypass
    if (user.role <= UserRole.Admin) return;

    // 2. Membership
    const membership = await this.membershipRepo.findByUserAndWorld(
      user.id,
      worldId,
    );
    if (!membership) {
      throw new ForbiddenException({
        code: 'MAP_OP_FORBIDDEN',
        message: 'Nejsi member tohoto světa',
      });
    }
    // 10.2-prep-1 — práh `>= PomocnyPJ` (4) — asistent PJ taky smí řídit mapu.
    // Korektor (3) je čistě obsahový workflow, ne taktická vrstva.
    const isWorldPJ = membership.role >= WorldRole.PomocnyPJ;
    if (isWorldPJ) return;

    // 3. Hráč — jen self-unassign
    if (op.type === 'member.unassign' && op.userId === user.id) return;

    throw new ForbiddenException({
      code: 'MAP_OP_FORBIDDEN',
      message: 'Tato cross-scene operace je PJ-only',
    });
  }

  /**
   * 10.2c-edit-1 — read access pro samotnou scénu (`GET /maps/:id`).
   *
   * Paralelní s `assertCanReadSceneLog`, ale s vlastním error code
   * `MAP_FORBIDDEN_OTHER_SCENE`. Klient může toast + redirect na empty
   * state ("Tuto scénu nemáš přiřazenou") místo generic 403 hlášky.
   *
   * - Sa/Admin: ✅ (global bypass, žádný membership lookup)
   * - PJ / PomocnyPJ světa: ✅
   * - Hráč: ✅ jen pokud `WorldMembership.currentSceneId === scene.id`
   * - Non-member nebo jiná scéna: 403 MAP_FORBIDDEN_OTHER_SCENE
   *
   * **Info leak:** 403 stejné pro non-member i pro hráče s jinou scénou,
   * aby nešlo enumerovat existenci scén.
   */
  async assertCanReadScene(
    user: OperationRequestUser,
    scene: MapScene,
  ): Promise<void> {
    if (user.role <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      user.id,
      scene.worldId,
    );
    if (!membership) {
      throw new ForbiddenException({
        code: 'MAP_FORBIDDEN_OTHER_SCENE',
        message: 'Tuto scénu nemáš přiřazenou',
      });
    }
    if (membership.role >= WorldRole.PomocnyPJ) return;
    // Hráč — jen vlastní currentSceneId
    if (membership.currentSceneId === scene.id) return;
    throw new ForbiddenException({
      code: 'MAP_FORBIDDEN_OTHER_SCENE',
      message: 'Tuto scénu nemáš přiřazenou',
    });
  }

  /**
   * Read access check pro `GET /maps/:id/operations` (per-scene log).
   *
   * - Sa/Admin: ✅
   * - PJ světa: ✅
   * - Hráč: ✅ jen pokud `currentSceneId === sceneId` (inter-scene privacy)
   * - Non-member: 403
   */
  async assertCanReadSceneLog(
    user: OperationRequestUser,
    scene: MapScene,
  ): Promise<void> {
    if (user.role <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      user.id,
      scene.worldId,
    );
    if (!membership) {
      throw new ForbiddenException({
        code: 'MAP_FORBIDDEN',
        message: 'Nejsi member tohoto světa',
      });
    }
    if (membership.role >= WorldRole.PomocnyPJ) return;
    // Hráč — jen log scény, na které je
    if (membership.currentSceneId === scene.id) return;
    throw new ForbiddenException({
      code: 'MAP_FORBIDDEN',
      message: 'Nemáš přístup k log této scény',
    });
  }

  /**
   * Read access check pro `GET /worlds/:id/operations` (cross-scene log).
   *
   * Jen PJ světa (privacy — hráč o cross-scene rozmístění nepotřebuje vědět;
   * dostává `map:reassigned` private emit).
   */
  async assertCanReadWorldLog(
    user: OperationRequestUser,
    worldId: string,
  ): Promise<void> {
    if (user.role <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      user.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException({
        code: 'MAP_FORBIDDEN',
        message: 'Cross-scene log je dostupný jen PJ / PomocnyPJ',
      });
    }
  }
}
