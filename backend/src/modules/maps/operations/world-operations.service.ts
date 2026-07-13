import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { IMapsRepository } from '../interfaces/maps-repository.interface';
import type { IWorldMembershipRepository } from '../../worlds/interfaces/world-membership-repository.interface';
import type { IWorldOperationsRepository } from '../../worlds/interfaces/world-operations-repository.interface';
import type { WorldOperationRecord } from '../../worlds/interfaces/world-operation.interface';
import type { WorldOperationPayload } from '../../worlds/dto/operations';
import { OperationPayloadValidator } from './operation-payload-validator.service';
import {
  OperationsAuthorizer,
  OperationRequestUser,
} from './operations-authorizer.service';
import { MapOperationsService } from './map-operations.service';
import { MapsGateway } from '../maps.gateway';

export interface ApplyWorldOperationResult {
  recordId: string;
  seqNumber: number;
  appliedAt: Date;
  op: WorldOperationPayload;
  inverse: WorldOperationPayload | null;
  cascadeMapOpIds: string[];
}

/**
 * 10.2-prep-1 — orchestrátor cross-scene operations (`worldOperations`).
 *
 * Hlavní use case: PJ `member.assignToScene` přesune hráče Matrixáře z mapa1
 * (boj v matrixu) na mapa2 (hospůdka u trolla). Server:
 *   1. resolvne oldSceneId = membership.currentSceneId
 *   2. najde hráčův token na staré scéně
 *   3. vyrobí cascade `token.remove` op (přes MapOperationsService — vlastní
 *      seqNumber v mapOperations, broadcast `map:operation` na old room)
 *   4. atomic update membership.currentSceneId = newSceneId
 *   5. log WorldOperation s cascadeMapOpIds reference
 *
 * Spec: docs/arch/maps/operations/data-models.md § Member operace,
 *       api.md `POST /worlds/:worldId/operations`, ai-notes.md § Cascade.
 */
@Injectable()
export class WorldOperationsService {
  constructor(
    @Inject('IMapsRepository')
    private readonly mapsRepo: IMapsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldOperationsRepository')
    private readonly opsRepo: IWorldOperationsRepository,
    private readonly validator: OperationPayloadValidator,
    private readonly authorizer: OperationsAuthorizer,
    private readonly mapOps: MapOperationsService,
    private readonly gateway: MapsGateway,
  ) {}

  async apply(
    worldId: string,
    rawOp: unknown,
    user: OperationRequestUser,
  ): Promise<ApplyWorldOperationResult> {
    // 1. Validate
    const op = this.validator.validateWorldOp(rawOp);

    // 2. Authorize
    await this.authorizer.assertCanDoWorldOp(user, worldId, op);

    // 3. Per typ — cascade + atomic update + inverse
    let cascadeMapOpIds: string[] = [];
    let inverse: WorldOperationPayload | null = null;

    switch (op.type) {
      case 'member.assignToScene': {
        const result = await this.handleAssignToScene(worldId, op, user);
        cascadeMapOpIds = result.cascadeMapOpIds;
        inverse = result.inverse;
        break;
      }
      case 'member.unassign': {
        const result = await this.handleUnassign(worldId, op, user);
        cascadeMapOpIds = result.cascadeMapOpIds;
        inverse = result.inverse;
        break;
      }
      case 'member.bulkAssignToScene': {
        const result = await this.handleBulkAssign(worldId, op, user);
        cascadeMapOpIds = result.cascadeMapOpIds;
        inverse = result.inverse;
        break;
      }
      case 'member.bulkRestoreAssignments': {
        const result = await this.handleBulkRestore(worldId, op, user);
        cascadeMapOpIds = result.cascadeMapOpIds;
        inverse = result.inverse;
        break;
      }
      default: {
        const _exhaustive: never = op;
        void _exhaustive;
        throw new BadRequestException({
          code: 'MAP_OP_INVALID',
          message: 'Neznámý typ cross-scene operace',
        });
      }
    }

    // 4. Allocate seqNumber + append log
    const seqNumber = await this.opsRepo.allocateSeqNumber(worldId);
    const record = await this.opsRepo.appendOperation({
      worldId,
      seqNumber,
      op: op as unknown as Record<string, unknown>,
      inverse: inverse as unknown as Record<string, unknown> | null,
      byUserId: user.id,
      byUserRole: user.role,
      appliedAt: new Date(),
      cascadeMapOpIds,
    });

    // 5. WS broadcast — world:operation (PJ orchestrator) + per-typ side eventy.
    //    cascade `map:operation` už emitoval MapOperationsService když ho
    //    cascade volal (krok 3); zde už neopakovat.
    this.gateway.emitWorldOperation(worldId, {
      worldId,
      seqNumber: record.seqNumber,
      op,
      byUserId: user.id,
      appliedAt: record.appliedAt,
      cascadeMapOpIds,
    });
    this.emitMemberSideEvents(worldId, op);

    return {
      recordId: record.id,
      seqNumber: record.seqNumber,
      appliedAt: record.appliedAt,
      op,
      inverse,
      cascadeMapOpIds,
    };
  }

  /**
   * Emit per-member side eventy po úspěšné apply:
   * - private `map:reassigned` na user socket (přesun na scénu / unassign)
   *
   * Pro bulkAssign rozhoduje per-user (loop). Pro assign/unassign single.
   */
  private emitMemberSideEvents(
    worldId: string,
    op: WorldOperationPayload,
  ): void {
    switch (op.type) {
      case 'member.assignToScene':
        this.emitForSingleAssign(worldId, op.userId, op.sceneId);
        return;
      case 'member.unassign':
        this.emitForSingleAssign(worldId, op.userId, null);
        return;
      case 'member.bulkAssignToScene': {
        for (const uid of op.userIds) {
          this.emitForSingleAssign(worldId, uid, op.sceneId);
        }
        return;
      }
      case 'member.bulkRestoreAssignments': {
        for (const a of op.assignments) {
          this.emitForSingleAssign(worldId, a.userId, a.sceneId);
        }
        return;
      }
    }
  }

  private emitForSingleAssign(
    worldId: string,
    userId: string,
    newSceneId: string | null,
  ): void {
    // S-01 (state-consistency audit) — `map:member-joined`/`-left` zrušeny:
    // byly to mrtvé emity bez FE listeneru. PJ orchestrátor čte member stav
    // z `world:operation` logu, ne z těchto eventů. Zůstává jen private
    // `map:reassigned` (přesun current usera na novou scénu / 404 → empty).
    this.gateway.emitReassigned(userId, newSceneId);
    // worldId nese jen world:operation broadcast (PJ orchestrátor má kontext).
    void worldId;
  }

  async findSince(
    worldId: string,
    since: number,
    limit: number,
  ): Promise<WorldOperationRecord[]> {
    return this.opsRepo.findSince(worldId, since, limit);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Per-op handlers
  // ───────────────────────────────────────────────────────────────────────

  private async handleAssignToScene(
    worldId: string,
    op: { type: 'member.assignToScene'; userId: string; sceneId: string },
    user: OperationRequestUser,
  ): Promise<{
    cascadeMapOpIds: string[];
    inverse: WorldOperationPayload | null;
  }> {
    // Validate cílová scéna existuje a patří do daného světa
    const newScene = await this.mapsRepo.findById(op.sceneId);
    if (!newScene) {
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Cílová scéna nenalezena',
      });
    }
    if (newScene.worldId !== worldId) {
      throw new ConflictException({
        code: 'MAP_MEMBER_NOT_IN_WORLD',
        message: 'Scéna patří do jiného světa',
      });
    }

    // Membership musí existovat
    const membership = await this.membershipRepo.findByUserAndWorld(
      op.userId,
      worldId,
    );
    if (!membership) {
      throw new NotFoundException({
        code: 'MAP_MEMBER_NOT_FOUND',
        message: 'Uživatel není member tohoto světa',
      });
    }
    const oldSceneId = membership.currentSceneId ?? null;

    // Cascade `token.remove` na staré scéně (pokud byla nějaká a hráč tam měl token)
    const cascadeMapOpIds: string[] = [];
    if (oldSceneId) {
      const cascadeId = await this.cascadeRemoveTokenFromScene(
        oldSceneId,
        op.userId,
        user,
      );
      if (cascadeId) cascadeMapOpIds.push(cascadeId);
    }

    // Atomic update membership
    await this.membershipRepo.setCurrentScene(op.userId, worldId, op.sceneId);

    // RC-D6 fix — scéna se mohla smazat v okně mezi validací (findById výše) a
    // tímto zápisem (`deleteScene` → `clearSceneForAll` proběhl DŘÍV, než jsme
    // sem zapsali → náš zápis vyrobil dangling `currentSceneId` na mrtvou scénu).
    // Re-ověř existenci po zápisu; když scéna zmizela, vrať membership zpět na
    // oldSceneId a hoď 404 (vzor RC-D3 re-check rodiče po save).
    const stillExists = await this.mapsRepo.findById(op.sceneId);
    if (!stillExists) {
      await this.membershipRepo.setCurrentScene(op.userId, worldId, oldSceneId);
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Cílová scéna byla mezitím smazána',
      });
    }

    // Inverse — zpět na oldSceneId (může být null → `member.unassign`)
    const inverse: WorldOperationPayload = oldSceneId
      ? {
          type: 'member.assignToScene',
          userId: op.userId,
          sceneId: oldSceneId,
        }
      : { type: 'member.unassign', userId: op.userId };

    return { cascadeMapOpIds, inverse };
  }

  private async handleUnassign(
    worldId: string,
    op: { type: 'member.unassign'; userId: string },
    user: OperationRequestUser,
  ): Promise<{
    cascadeMapOpIds: string[];
    inverse: WorldOperationPayload | null;
  }> {
    const membership = await this.membershipRepo.findByUserAndWorld(
      op.userId,
      worldId,
    );
    if (!membership) {
      throw new NotFoundException({
        code: 'MAP_MEMBER_NOT_FOUND',
        message: 'Uživatel není member tohoto světa',
      });
    }
    const oldSceneId = membership.currentSceneId ?? null;

    // Cascade token.remove (postava odejde z předchozí scény)
    const cascadeMapOpIds: string[] = [];
    if (oldSceneId) {
      const cascadeId = await this.cascadeRemoveTokenFromScene(
        oldSceneId,
        op.userId,
        user,
      );
      if (cascadeId) cascadeMapOpIds.push(cascadeId);
    }

    // Atomic update — set null
    await this.membershipRepo.setCurrentScene(op.userId, worldId, null);

    // Inverse — pokud byl někde předtím, undo by re-assignlo zpět
    const inverse: WorldOperationPayload | null = oldSceneId
      ? {
          type: 'member.assignToScene',
          userId: op.userId,
          sceneId: oldSceneId,
        }
      : null;

    return { cascadeMapOpIds, inverse };
  }

  private async handleBulkAssign(
    worldId: string,
    op: {
      type: 'member.bulkAssignToScene';
      userIds: string[];
      sceneId: string;
    },
    user: OperationRequestUser,
  ): Promise<{
    cascadeMapOpIds: string[];
    inverse: WorldOperationPayload | null;
  }> {
    // Validate cílová scéna
    const newScene = await this.mapsRepo.findById(op.sceneId);
    if (!newScene) {
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Cílová scéna nenalezena',
      });
    }
    if (newScene.worldId !== worldId) {
      throw new ConflictException({
        code: 'MAP_MEMBER_NOT_IN_WORLD',
        message: 'Scéna patří do jiného světa',
      });
    }

    // Load všechny memberships (pro inverse snapshots + cascade lookups)
    const memberships = await Promise.all(
      op.userIds.map((uid) =>
        this.membershipRepo.findByUserAndWorld(uid, worldId),
      ),
    );
    const missingIdx = memberships.findIndex((m) => m === null);
    if (missingIdx !== -1) {
      throw new NotFoundException({
        code: 'MAP_MEMBER_NOT_FOUND',
        message: `Uživatel ${op.userIds[missingIdx]} není member`,
      });
    }

    // Cascade per affected old scene
    const cascadeMapOpIds: string[] = [];
    for (let i = 0; i < op.userIds.length; i++) {
      const uid = op.userIds[i];
      const oldSceneId = memberships[i]!.currentSceneId ?? null;
      if (oldSceneId) {
        const cascadeId = await this.cascadeRemoveTokenFromScene(
          oldSceneId,
          uid,
          user,
        );
        if (cascadeId) cascadeMapOpIds.push(cascadeId);
      }
    }

    // Bulk update
    await this.membershipRepo.setCurrentSceneForMany(
      op.userIds,
      worldId,
      op.sceneId,
    );

    // RC-D6 fix — scéna se mohla smazat v okně validace↔zápis (viz
    // `handleAssignToScene`). Re-ověř; když zmizela, vyčisti právě nastavené
    // dangling refy (set null) a hoď 404.
    const stillExists = await this.mapsRepo.findById(op.sceneId);
    if (!stillExists) {
      await this.membershipRepo.setCurrentSceneForMany(
        op.userIds,
        worldId,
        null,
      );
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Cílová scéna byla mezitím smazána',
      });
    }

    // D-NEW-INV-MAPS — inverse = `member.bulkRestoreAssignments` s PŮVODNÍM
    // per-member přiřazením (before-stav z memberships snapshotu načteného
    // před zápisem; `null` = member byl bez scény → restore ho unassigne).
    const inverse: WorldOperationPayload = {
      type: 'member.bulkRestoreAssignments',
      assignments: op.userIds.map((uid, i) => ({
        userId: uid,
        sceneId: memberships[i]!.currentSceneId ?? null,
      })),
    };

    return { cascadeMapOpIds, inverse };
  }

  /**
   * D-NEW-INV-MAPS — obnoví per-member přiřazení (inverse `bulkAssignToScene`).
   * Každý member může mít jinou cílovou scénu (nebo `null` = unassign).
   * PJ-only (authorizer). Vlastní inverse = bulkRestore zpět na stav před
   * touto operací (redo-friendly).
   */
  private async handleBulkRestore(
    worldId: string,
    op: {
      type: 'member.bulkRestoreAssignments';
      assignments: { userId: string; sceneId: string | null }[];
    },
    user: OperationRequestUser,
  ): Promise<{
    cascadeMapOpIds: string[];
    inverse: WorldOperationPayload | null;
  }> {
    // Validate cílové scény (distinct, bez null) — existence + patří do světa
    const targetSceneIds = [
      ...new Set(
        op.assignments
          .map((a) => a.sceneId)
          .filter((id): id is string => id !== null),
      ),
    ];
    for (const sceneId of targetSceneIds) {
      const scene = await this.mapsRepo.findById(sceneId);
      if (!scene) {
        throw new NotFoundException({
          code: 'MAP_SCENE_NOT_FOUND',
          message: 'Cílová scéna nenalezena',
        });
      }
      if (scene.worldId !== worldId) {
        throw new ConflictException({
          code: 'MAP_MEMBER_NOT_IN_WORLD',
          message: 'Scéna patří do jiného světa',
        });
      }
    }

    // Load memberships (before-stav pro vlastní inverse + cascade lookup)
    const memberships = await Promise.all(
      op.assignments.map((a) =>
        this.membershipRepo.findByUserAndWorld(a.userId, worldId),
      ),
    );
    const missingIdx = memberships.findIndex((m) => m === null);
    if (missingIdx !== -1) {
      throw new NotFoundException({
        code: 'MAP_MEMBER_NOT_FOUND',
        message: `Uživatel ${op.assignments[missingIdx].userId} není member`,
      });
    }

    // Cascade token.remove ze staré scény (jen když se scéna reálně mění)
    const cascadeMapOpIds: string[] = [];
    for (let i = 0; i < op.assignments.length; i++) {
      const oldSceneId = memberships[i]!.currentSceneId ?? null;
      const newSceneId = op.assignments[i].sceneId;
      if (oldSceneId && oldSceneId !== newSceneId) {
        const cascadeId = await this.cascadeRemoveTokenFromScene(
          oldSceneId,
          op.assignments[i].userId,
          user,
        );
        if (cascadeId) cascadeMapOpIds.push(cascadeId);
      }
    }

    // Per-member update (cíle se liší → nelze setCurrentSceneForMany)
    for (const a of op.assignments) {
      await this.membershipRepo.setCurrentScene(a.userId, worldId, a.sceneId);
    }

    // RC-D6 vzor — scéna se mohla smazat v okně validace↔zápis. Re-ověř;
    // dotčené membery vrať na null (úklid dangling refů) a hoď 404.
    for (const sceneId of targetSceneIds) {
      const stillExists = await this.mapsRepo.findById(sceneId);
      if (!stillExists) {
        for (const a of op.assignments) {
          if (a.sceneId === sceneId) {
            await this.membershipRepo.setCurrentScene(a.userId, worldId, null);
          }
        }
        throw new NotFoundException({
          code: 'MAP_SCENE_NOT_FOUND',
          message: 'Cílová scéna byla mezitím smazána',
        });
      }
    }

    const inverse: WorldOperationPayload = {
      type: 'member.bulkRestoreAssignments',
      assignments: op.assignments.map((a, i) => ({
        userId: a.userId,
        sceneId: memberships[i]!.currentSceneId ?? null,
      })),
    };

    return { cascadeMapOpIds, inverse };
  }

  /**
   * Helper — pokud má `userId` token na `sceneId` (charakter, ne NPC), vytvoří
   * cascade `token.remove` přes `MapOperationsService.apply`. Returns recordId
   * (nebo null pokud token nebyl).
   *
   * Tato cascade má vlastní seqNumber v `mapOperations` (per-scene log),
   * vlastní inverse `token.add` snapshot, a vlastní `map:operation` broadcast
   * (zařídí gateway v C8 po apply).
   */
  private async cascadeRemoveTokenFromScene(
    sceneId: string,
    userId: string,
    actingUser: OperationRequestUser,
  ): Promise<string | null> {
    const scene = await this.mapsRepo.findById(sceneId);
    if (!scene) return null; // Stará scéna mezitím smazána — silent skip
    const token = scene.tokens.find(
      (t) => t.characterId === userId && !t.isNpc,
    );
    if (!token) return null;

    const result = await this.mapOps.apply(
      sceneId,
      { type: 'token.remove', tokenId: token.id },
      actingUser,
    );
    return result.recordId;
  }
}
