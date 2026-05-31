import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { IMapsRepository } from '../interfaces/maps-repository.interface';
import type { IMapOperationsRepository } from '../interfaces/map-operations-repository.interface';
import type { MapOperationRecord } from '../interfaces/map-operation.interface';
import type {
  MapScene,
  MapToken,
  MapEffect,
  HexCoord,
  ScenePlayerState,
} from '../interfaces/map-scene.interface';
import type { MapOperationPayload } from '../dto/operations';
import { OperationPayloadValidator } from './operation-payload-validator.service';
import {
  OperationsAuthorizer,
  OperationRequestUser,
} from './operations-authorizer.service';
import { MapsGateway } from '../maps.gateway';
import type { IWorldsRepository } from '../../worlds/interfaces/worlds-repository.interface';
import type { IWorldMembershipRepository } from '../../worlds/interfaces/world-membership-repository.interface';
import type { IWorldOperationsRepository } from '../../worlds/interfaces/world-operations-repository.interface';
import { SystemStatsValidatorService } from '../schemas/system-entity-schema/system-stats-validator.service';

export interface ApplyMapOperationResult {
  recordId: string;
  seqNumber: number;
  appliedAt: Date;
  op: MapOperationPayload;
  inverse: MapOperationPayload | null;
  /**
   * 10.2c-edit-1 — `false` znamená idempotent no-op (např. `scene.deactivate`
   * volaný na už neaktivní scénu). Server vrací 200 + tento flag, žádný log
   * ani broadcast. Bez tohoto pole = `true` (kompatibilita).
   */
  applied?: boolean;
}

/**
 * 10.2-prep-1 — orchestrátor per-scene operations.
 *
 * `apply()` flow:
 *   1. Validate input → MapOperationPayload (throws MAP_OP_INVALID)
 *   2. Load scene snapshot (potřeba pro inverse + authorizer)
 *   3. Authorize (throws MAP_OP_FORBIDDEN / MAP_TOKEN_NOT_FOUND)
 *   4. Compute inverse z snapshotu (null pokud nelze undo)
 *   5. Atomic Mongo update (per typ)
 *   6. Allocate seqNumber (atomic $inc na MapScene.lastSeqNumber)
 *   7. Append do mapOperations log
 *
 * Spec: docs/arch/maps/operations/data-models.md, api.md, ai-notes.md.
 */
@Injectable()
export class MapOperationsService {
  constructor(
    @Inject('IMapsRepository') private readonly mapsRepo: IMapsRepository,
    @Inject('IMapOperationsRepository')
    private readonly opsRepo: IMapOperationsRepository,
    private readonly validator: OperationPayloadValidator,
    private readonly authorizer: OperationsAuthorizer,
    private readonly gateway: MapsGateway,
    // 10.2d-prep-A C12 — validate systemStats v token.add / token.update
    // proti per-system schématu. Optional: bez injekce skip (lze defer DI
    // configuration pokud schema-engine yet wired).
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    private readonly statsValidator: SystemStatsValidatorService,
    // 10.2c-edit-1 — scene.deactivate cascade unassign affected hráčů.
    // Injektujeme repos přímo (ne WorldOperationsService) abychom se vyhnuli
    // cyklické závislosti (worldOps injectuje mapOps pro vlastní cascade).
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldOperationsRepository')
    private readonly worldOpsRepo: IWorldOperationsRepository,
  ) {}

  async apply(
    sceneId: string,
    rawOp: unknown,
    user: OperationRequestUser,
  ): Promise<ApplyMapOperationResult> {
    // 1. Validate
    const op = this.validator.validateMapOp(rawOp);

    // 2. Load snapshot
    const scene = await this.mapsRepo.findById(sceneId);
    if (!scene) {
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
    }

    // 3. Authorize
    await this.authorizer.assertCanDo(user, scene, op);

    // 4. Inverse
    const inverse = this.computeInverse(scene, op);

    // 5. Atomic apply — `scene.deactivate` může throw MAP_OP_NOOP pro idempotent
    //    return (CAS nezachytí change → scéna už byla neaktivní). Tento případ
    //    NE-ného error — vrátíme `applied: false` bez allocate/log/broadcast.
    try {
      await this.applyAtomic(sceneId, scene, op, user);
    } catch (e) {
      if (
        e instanceof ConflictException &&
        (e.getResponse() as { code?: string })?.code === 'MAP_OP_NOOP'
      ) {
        return {
          recordId: '',
          seqNumber: scene.lastSeqNumber ?? 0,
          appliedAt: new Date(),
          op,
          inverse: null,
          applied: false,
        };
      }
      throw e;
    }

    // 6. Allocate seqNumber (po úspěšném apply — pokud apply throws, neinkrementujeme).
    //    Edge: pokud apply succeed ale allocate selže, gap v sekvenci.
    //    Per tests.md open Q: akceptujeme.
    const seqNumber = await this.opsRepo.allocateSeqNumber(sceneId);

    // 7. Append log
    const record = await this.opsRepo.appendOperation({
      sceneId,
      worldId: scene.worldId,
      seqNumber,
      op: op as unknown as Record<string, unknown>,
      inverse: inverse as unknown as Record<string, unknown> | null,
      byUserId: user.id,
      byUserRole: user.role,
      appliedAt: new Date(),
    });

    // 8. WS broadcast `map:operation` na room sceneId (po DB commit, ne před).
    //    inverse se NEpošle klientům — server-only metadata pro undo (klient
    //    iniciátora dostal inverse v 201 response).
    this.gateway.emitMapOperation(sceneId, {
      sceneId,
      seqNumber: record.seqNumber,
      op,
      byUserId: user.id,
      appliedAt: record.appliedAt,
    });

    return {
      recordId: record.id,
      seqNumber: record.seqNumber,
      appliedAt: record.appliedAt,
      op,
      inverse,
    };
  }

  async findSince(
    sceneId: string,
    since: number,
    limit: number,
  ): Promise<MapOperationRecord[]> {
    return this.opsRepo.findSince(sceneId, since, limit);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Inverse computation per typ
  // ───────────────────────────────────────────────────────────────────────

  private computeInverse(
    scene: MapScene,
    op: MapOperationPayload,
  ): MapOperationPayload | null {
    switch (op.type) {
      case 'token.add':
        return {
          type: 'token.remove',
          tokenId: op.token.id,
        };

      case 'token.move': {
        const token = scene.tokens.find((t) => t.id === op.tokenId);
        if (!token) return null;
        return {
          type: 'token.move',
          tokenId: op.tokenId,
          q: token.q,
          r: token.r,
        };
      }

      case 'token.remove': {
        const token = scene.tokens.find((t) => t.id === op.tokenId);
        if (!token) return null;
        return {
          type: 'token.add',
          token: token as unknown as Record<string, unknown> & { id: string },
        } as unknown as MapOperationPayload;
      }

      case 'token.update': {
        const token = scene.tokens.find((t) => t.id === op.tokenId);
        if (!token) return null;
        const oldPatch: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          oldPatch[key] = (token as unknown as Record<string, unknown>)[key];
        }
        return {
          type: 'token.update',
          tokenId: op.tokenId,
          patch: oldPatch,
        };
      }

      case 'effect.add':
        return {
          type: 'effect.remove',
          effectId: op.effect.id,
        };

      case 'effect.remove': {
        const effect = scene.effects.find((e) => e.id === op.effectId);
        if (!effect) return null;
        return {
          type: 'effect.add',
          effect: effect as unknown as Record<string, unknown> & {
            id: string;
            type: string;
          },
        } as unknown as MapOperationPayload;
      }

      case 'effect.update': {
        const effect = scene.effects.find((e) => e.id === op.effectId);
        if (!effect) return null;
        const oldPatch: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          oldPatch[key] = (effect as unknown as Record<string, unknown>)[key];
        }
        return {
          type: 'effect.update',
          effectId: op.effectId,
          patch: oldPatch,
        };
      }

      case 'fog.set':
        return {
          type: 'fog.set',
          enabled: scene.fogEnabled,
          revealedHexes: scene.revealedHexes,
        };

      case 'fog.brush': {
        // Inverse je opačný mode se stejnými hexy (s úvahou, že některé hexy
        // už mohly být ve výchozím stavu cílovém — drobná nepřesnost, ale
        // acceptable pro MVP).
        const inverseMode = op.mode === 'reveal' ? 'fog' : 'reveal';
        return {
          type: 'fog.brush',
          mode: inverseMode,
          hexes: op.hexes,
        };
      }

      case 'scene.state': {
        const oldFields: { isHidden?: boolean; isLocked?: boolean } = {};
        if (op.isHidden !== undefined) oldFields.isHidden = scene.isHidden;
        if (op.isLocked !== undefined) oldFields.isLocked = scene.isLocked;
        return {
          type: 'scene.state',
          ...oldFields,
        };
      }

      // 10.2n — per-hráč override. Inverse obnoví předchozí hodnotu dotčených
      // polí (`null` = původně bez override → undo smaže). Jen pole, která op
      // měnil (undefined necháváme nedotčená).
      case 'scene.playerState': {
        const existing = scene.playerStates?.find(
          (p) => p.userId === op.userId,
        );
        const inv: {
          type: 'scene.playerState';
          userId: string;
          isHidden?: boolean | null;
          isLocked?: boolean | null;
        } = { type: 'scene.playerState', userId: op.userId };
        if (op.isHidden !== undefined)
          inv.isHidden = existing?.isHidden ?? null;
        if (op.isLocked !== undefined)
          inv.isLocked = existing?.isLocked ?? null;
        return inv;
      }

      case 'scene.config':
        return {
          type: 'scene.config',
          config: scene.config as unknown as Record<string, unknown>,
        };

      case 'scene.image':
        return {
          type: 'scene.image',
          imageUrl: scene.imageUrl,
        };

      case 'scene.name':
        return {
          type: 'scene.name',
          name: scene.name,
        };

      case 'scene.folder':
        return {
          type: 'scene.folder',
          folder: scene.folder ?? null,
        };

      case 'scene.deactivate':
        // 10.2c-edit-1 — undo by potřeboval `scene.activate-with-members
        // { previousMemberIds: string[] }` který znovu nastaví všem affected
        // hráčům currentSceneId zpět. Pro MVP držíme inverse = null (PJ musí
        // znovu aktivovat ručně + ručně přiřadit hráče).
        return null;

      // 10.2c-edit-2 — load šablony sekvence: inverse = snapshot předchozího stavu
      case 'scene.fog.replace':
        return {
          type: 'scene.fog.replace',
          fogEnabled: scene.fogEnabled,
          revealedHexes: scene.revealedHexes,
        };

      case 'scene.effects.replace':
        return {
          type: 'scene.effects.replace',
          effects: scene.effects,
        };

      case 'scene.npc-templates.replace':
        return {
          type: 'scene.npc-templates.replace',
          npcTemplates: scene.npcTemplates,
        };

      case 'scene.tokens.replace-npc':
        // Inverse = current NPC tokens (pre-replace snapshot)
        return {
          type: 'scene.tokens.replace-npc',
          tokens: scene.tokens.filter((t) => t.isNpc),
        };

      case 'scene.sounds.set':
        return {
          type: 'scene.sounds.set',
          activeSoundIds: scene.activeSoundIds,
        };

      case 'sound.playlist':
        return {
          type: 'sound.playlist',
          soundIds: scene.activeSoundIds,
        };

      case 'combat.start':
        // Pokud už combat běží, validate v applyAtomic vyhodí PRECONDITION_FAILED;
        // inverse je `combat.end` (boj se „zruší" — order se ztratí).
        return { type: 'combat.end' };

      case 'combat.turn': {
        const prevTokenId =
          (scene.combat as { currentTokenId?: string } | null)
            ?.currentTokenId ?? '';
        return {
          type: 'combat.turn',
          tokenId: prevTokenId,
        };
      }

      case 'combat.end': {
        const order =
          (scene.combat as { order?: string[] } | null)?.order ?? [];
        if (order.length === 0) return null;
        return {
          type: 'combat.start',
          orderTokenIds: order,
        };
      }

      case 'combat.reorder': {
        // Inverse = reorder zpět na původní pořadí.
        const order =
          (scene.combat as { order?: string[] } | null)?.order ?? [];
        if (order.length === 0) return null;
        return {
          type: 'combat.reorder',
          orderTokenIds: order,
        };
      }

      case 'combat.effect.add': {
        const effectId = (op.effect as { id?: string }).id;
        if (!effectId) return null;
        return {
          type: 'combat.effect.remove',
          effectId,
        };
      }

      case 'combat.effect.remove': {
        const effects =
          (scene.combat as { endOfTurnEffects?: Array<{ id?: string }> } | null)
            ?.endOfTurnEffects ?? [];
        const found = effects.find((e) => e.id === op.effectId);
        if (!found) return null;
        return {
          type: 'combat.effect.add',
          tokenId: (found as { tokenId?: string }).tokenId ?? '',
          effect: found,
        };
      }

      case 'npcTemplate.add':
        return {
          type: 'npcTemplate.remove',
          templateId: op.template.id,
        };

      case 'npcTemplate.remove': {
        const tpl = scene.npcTemplates.find((n) => n.id === op.templateId);
        if (!tpl) return null;
        // Cascade undo by potřebovalo re-add affected tokens — držíme to jako
        // single `npcTemplate.add` (cascade re-spawn tokenů odložen, viz
        // ai-notes § Časté chyby — kompozitní op, post-MVP).
        return {
          type: 'npcTemplate.add',
          template: tpl as unknown as Record<string, unknown> & {
            id: string;
            name: string;
          },
        } as unknown as MapOperationPayload;
      }

      case 'npcTemplate.update': {
        const tpl = scene.npcTemplates.find((n) => n.id === op.templateId);
        if (!tpl) return null;
        const oldPatch: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          oldPatch[key] = (tpl as unknown as Record<string, unknown>)[key];
        }
        return {
          type: 'npcTemplate.update',
          templateId: op.templateId,
          patch: oldPatch,
        };
      }

      // 10.2c-edit-7 — clear scény: inverse = full snapshot tokenů + combat
      case 'scene.tokens.clear': {
        return {
          type: 'scene.tokens.replace',
          tokens: scene.tokens,
          combat: scene.combat ?? null,
        };
      }

      // 10.2c-edit-7 — generic replace tokenů: inverse = předchozí snapshot
      case 'scene.tokens.replace': {
        return {
          type: 'scene.tokens.replace',
          tokens: scene.tokens,
          combat: scene.combat ?? null,
        };
      }

      // 10.2c-edit-7 — per-scéna whitelist postav (PC + NPC)
      case 'scene.activeCharacters.add': {
        const list =
          (scene as unknown as { activeCharacterIds?: string[] })
            .activeCharacterIds ?? [];
        if (list.includes(op.characterId)) return null; // no-op
        return {
          type: 'scene.activeCharacters.remove',
          characterId: op.characterId,
        };
      }

      case 'scene.activeCharacters.remove': {
        const list =
          (scene as unknown as { activeCharacterIds?: string[] })
            .activeCharacterIds ?? [];
        if (!list.includes(op.characterId)) return null; // no-op
        return {
          type: 'scene.activeCharacters.add',
          characterId: op.characterId,
        };
      }

      // 10.2c-edit-7 — per-scéna whitelist bestií
      case 'scene.activeBestie.add': {
        const list =
          (scene as unknown as { activeBestieIds?: string[] })
            .activeBestieIds ?? [];
        if (list.includes(op.bestieId)) return null;
        return {
          type: 'scene.activeBestie.remove',
          bestieId: op.bestieId,
        };
      }

      case 'scene.activeBestie.remove': {
        const list =
          (scene as unknown as { activeBestieIds?: string[] })
            .activeBestieIds ?? [];
        if (!list.includes(op.bestieId)) return null;
        return {
          type: 'scene.activeBestie.add',
          bestieId: op.bestieId,
        };
      }

      default:
        return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Atomic apply per typ
  // ───────────────────────────────────────────────────────────────────────

  private async applyAtomic(
    sceneId: string,
    scene: MapScene,
    op: MapOperationPayload,
    user: OperationRequestUser,
  ): Promise<void> {
    const now = new Date();

    switch (op.type) {
      case 'token.add': {
        // 10.2d-prep-A C12 — validate systemStats proti per-system schema.
        // Soft mode: pokud schema neexistuje nebo systemStats chybí, skip
        // (BC s ne-refaktorovaným 8.x kódem).
        await this.validateTokenStats(scene, op.token, true);
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $push: { tokens: op.token as unknown as MapToken },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'token.move': {
        const result = await this.mapsRepo.atomicUpdate(
          { _id: sceneId, 'tokens.id': op.tokenId },
          {
            $set: {
              'tokens.$.q': op.q,
              'tokens.$.r': op.r,
              lastModified: now,
            },
          },
        );
        if (result.matchedCount === 0) {
          throw new NotFoundException({
            code: 'MAP_TOKEN_NOT_FOUND',
            message: 'Token nenalezen',
          });
        }
        return;
      }

      case 'token.remove': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $pull: { tokens: { id: op.tokenId } },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'token.update': {
        // 10.2d-prep-A C12 — validate systemStats patch proti schema.
        if (
          (op.patch as { systemStats?: Record<string, unknown> }).systemStats
        ) {
          await this.validateTokenStatsPatch(
            scene,
            (op.patch as { systemStats: Record<string, unknown> }).systemStats,
          );
        }
        const setFields: Record<string, unknown> = { lastModified: now };
        for (const key of Object.keys(op.patch)) {
          setFields[`tokens.$.${key}`] = op.patch[key];
        }
        const result = await this.mapsRepo.atomicUpdate(
          { _id: sceneId, 'tokens.id': op.tokenId },
          { $set: setFields },
        );
        if (result.matchedCount === 0) {
          throw new NotFoundException({
            code: 'MAP_TOKEN_NOT_FOUND',
            message: 'Token nenalezen',
          });
        }
        // 10.2e C6 — Character sync (token → character) pro PC/NPC postavy.
        // Bestie tokeny mají snapshot semantics → skip.
        // ⚠️ Soft mode: Character.systemStats jako pole zatím není rozšířené
        // v 8.x reload (krok defer). Sync se zapne automaticky až Character
        // dostane systemStats; teď jen log debug.
        if (
          (op.patch as { systemStats?: Record<string, unknown> }).systemStats
        ) {
          const tokenInScene = scene.tokens.find((t) => t.id === op.tokenId);
          const isBestie =
            !!tokenInScene?.templateId ||
            tokenInScene?.characterId.startsWith('bestie:');
          if (!isBestie) {
            // TODO 10.2e-sync (postpone 8.x reload): volat
            //   charactersService.updatePartialSystemStats(characterId, patch.systemStats)
            // Mezitím UI musí Character refresh ručně.
          }
        }
        return;
      }

      case 'effect.add': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $push: { effects: op.effect as unknown as MapEffect },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'effect.remove': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $pull: { effects: { id: op.effectId } },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'effect.update': {
        const setFields: Record<string, unknown> = { lastModified: now };
        for (const key of Object.keys(op.patch)) {
          setFields[`effects.$.${key}`] = op.patch[key];
        }
        const result = await this.mapsRepo.atomicUpdate(
          { _id: sceneId, 'effects.id': op.effectId },
          { $set: setFields },
        );
        if (result.matchedCount === 0) {
          throw new NotFoundException({
            code: 'MAP_EFFECT_NOT_FOUND',
            message: 'Efekt nenalezen',
          });
        }
        return;
      }

      case 'fog.set': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              fogEnabled: op.enabled,
              revealedHexes: op.revealedHexes as unknown as HexCoord[],
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'fog.brush': {
        if (op.mode === 'reveal') {
          await this.mapsRepo.atomicUpdate(
            { _id: sceneId },
            {
              $addToSet: {
                revealedHexes: { $each: op.hexes as unknown as HexCoord[] },
              },
              $set: { lastModified: now },
            },
          );
        } else {
          await this.mapsRepo.atomicUpdate(
            { _id: sceneId },
            {
              $pullAll: { revealedHexes: op.hexes as unknown as HexCoord[] },
              $set: { lastModified: now },
            },
          );
        }
        return;
      }

      case 'scene.state': {
        const setFields: Record<string, unknown> = { lastModified: now };
        if (op.isHidden !== undefined) setFields.isHidden = op.isHidden;
        if (op.isLocked !== undefined) setFields.isLocked = op.isLocked;
        await this.mapsRepo.atomicUpdate({ _id: sceneId }, { $set: setFields });
        return;
      }

      // 10.2n — per-hráč override. Merge nad existujícím entry (scene už načtená),
      // `null` smaže pole, `undefined` nechá beze změny. Prázdný entry (žádné
      // override pole) se z pole vyřadí. `$set` celého `playerStates` — per-scéna
      // nízká kontence (jeden PJ), op pipeline navíc serializuje přes seqNumber.
      case 'scene.playerState': {
        const others = (scene.playerStates ?? []).filter(
          (p) => p.userId !== op.userId,
        );
        const existing = scene.playerStates?.find(
          (p) => p.userId === op.userId,
        );
        const merged: ScenePlayerState = { userId: op.userId };
        if (existing?.isHidden !== undefined)
          merged.isHidden = existing.isHidden;
        if (existing?.isLocked !== undefined)
          merged.isLocked = existing.isLocked;
        if (op.isHidden === null) delete merged.isHidden;
        else if (op.isHidden !== undefined) merged.isHidden = op.isHidden;
        if (op.isLocked === null) delete merged.isLocked;
        else if (op.isLocked !== undefined) merged.isLocked = op.isLocked;
        const next =
          merged.isHidden !== undefined || merged.isLocked !== undefined
            ? [...others, merged]
            : others;
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          { $set: { playerStates: next, lastModified: now } },
        );
        return;
      }

      case 'scene.config':
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          { $set: { config: op.config, lastModified: now } },
        );
        return;

      case 'scene.image':
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          { $set: { imageUrl: op.imageUrl, lastModified: now } },
        );
        return;

      case 'scene.name':
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          { $set: { name: op.name, lastModified: now } },
        );
        return;

      case 'scene.folder': {
        if (op.folder === null) {
          await this.mapsRepo.atomicUpdate(
            { _id: sceneId },
            { $unset: { folder: '' }, $set: { lastModified: now } },
          );
        } else {
          await this.mapsRepo.atomicUpdate(
            { _id: sceneId },
            { $set: { folder: op.folder, lastModified: now } },
          );
        }
        return;
      }

      case 'scene.deactivate': {
        // 10.2c-edit-1 — CAS isActive: true → false; pokud už neaktivní,
        // throw MAP_OP_NOOP signal (apply() ho rozliší pro idempotent return).
        const result = await this.mapsRepo.atomicUpdate(
          { _id: sceneId, isActive: true },
          { $set: { isActive: false, lastModified: now } },
        );
        if (result.matchedCount === 0) {
          throw new ConflictException({
            code: 'MAP_OP_NOOP',
            message: 'Scéna už není aktivní',
          });
        }
        // Cascade unassign — najdi memberships s currentSceneId === sceneId
        const memberships = await this.membershipRepo.findByWorldId(
          scene.worldId,
        );
        const affected = memberships.filter(
          (m) => m.currentSceneId === sceneId,
        );
        for (const memb of affected) {
          // Atomic unassign
          await this.membershipRepo.setCurrentScene(
            memb.userId,
            scene.worldId,
            null,
          );
          // Log do worldOperations
          const wSeqNumber = await this.worldOpsRepo.allocateSeqNumber(
            scene.worldId,
          );
          const wRecord = await this.worldOpsRepo.appendOperation({
            worldId: scene.worldId,
            seqNumber: wSeqNumber,
            op: {
              type: 'member.unassign',
              userId: memb.userId,
            },
            inverse: {
              type: 'member.assignToScene',
              userId: memb.userId,
              sceneId,
            },
            byUserId: user.id,
            byUserRole: user.role,
            appliedAt: new Date(),
            cascadeMapOpIds: [],
          });
          // WS — world:operation (PJ orchestrátor obnoví MemberAssignmentTable)
          this.gateway.emitWorldOperation(scene.worldId, {
            worldId: scene.worldId,
            seqNumber: wRecord.seqNumber,
            op: { type: 'member.unassign', userId: memb.userId },
            byUserId: user.id,
            appliedAt: wRecord.appliedAt,
            cascadeMapOpIds: [],
          });
          // WS — privát map:reassigned (klient zjistí, že přišel o scénu →
          // FE invaliduje active scene query → empty state).
          this.gateway.emitReassigned(memb.userId, null);
        }
        return;
      }

      // 10.2c-edit-2 — load šablony sekvence (PJ-only, atomic replace).
      // Authorize: assertCanDo už dropluje hráče (jen PJ projde defaultem).
      case 'scene.fog.replace': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              fogEnabled: op.fogEnabled,
              revealedHexes: op.revealedHexes as unknown as HexCoord[],
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'scene.effects.replace': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              effects: op.effects as unknown as MapEffect[],
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'scene.npc-templates.replace': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              npcTemplates: op.npcTemplates,
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'scene.tokens.replace-npc': {
        // Server-side filter: pouze NPC tokeny z payloadu (defense in depth).
        // PC tokeny ve scéně zachováváme.
        const newNpcTokens = (op.tokens as MapToken[]).filter((t) => t.isNpc);
        const existingPcTokens = scene.tokens.filter((t) => !t.isNpc);
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              tokens: [...existingPcTokens, ...newNpcTokens],
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'scene.sounds.set': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              activeSoundIds: op.activeSoundIds,
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'sound.playlist':
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          { $set: { activeSoundIds: op.soundIds, lastModified: now } },
        );
        return;

      case 'combat.start': {
        if ((scene.combat as { isActive?: boolean } | null)?.isActive) {
          throw new ConflictException({
            code: 'MAP_OP_PRECONDITION_FAILED',
            message: 'Boj už je aktivní; nejdřív combat.end',
          });
        }
        // Validate orderTokenIds existují
        const tokenIds = new Set(scene.tokens.map((t) => t.id));
        for (const id of op.orderTokenIds) {
          if (!tokenIds.has(id)) {
            throw new BadRequestException({
              code: 'MAP_OP_INVALID',
              message: `Token ${id} v orderTokenIds neexistuje na scéně`,
            });
          }
        }
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              combat: {
                isActive: true,
                round: 1,
                currentTokenId: op.orderTokenIds[0],
                order: op.orderTokenIds,
                endOfTurnEffects: [],
                startedAt: now,
              },
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'combat.turn': {
        const combat = scene.combat as {
          isActive?: boolean;
          round?: number;
          currentTokenId?: string;
          order?: string[];
        } | null;
        if (!combat?.isActive) {
          throw new ConflictException({
            code: 'MAP_OP_PRECONDITION_FAILED',
            message: 'Boj není aktivní',
          });
        }
        const order = combat.order ?? [];
        let nextTokenId: string;
        let nextRound = op.round ?? combat.round ?? 1;
        if (op.tokenId) {
          // 10.2f — živý sort: token nemusí být v (zastaralém) order, musí ale
          // existovat na scéně. FE řídí pořadí + round.
          if (!scene.tokens.some((t) => t.id === op.tokenId)) {
            throw new BadRequestException({
              code: 'MAP_OP_INVALID',
              message: `Token ${op.tokenId} neexistuje na scéně`,
            });
          }
          nextTokenId = op.tokenId;
        } else {
          // Legacy: next in order; po posledním → další kolo (BC).
          const currentIdx = order.indexOf(combat.currentTokenId ?? '');
          const nextIdx = (currentIdx + 1) % order.length;
          nextTokenId = order[nextIdx];
          if (op.round === undefined && nextIdx === 0)
            nextRound = (combat.round ?? 1) + 1;
        }
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              'combat.currentTokenId': nextTokenId,
              'combat.round': nextRound,
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'combat.end': {
        if (!(scene.combat as { isActive?: boolean } | null)?.isActive) {
          throw new ConflictException({
            code: 'MAP_OP_PRECONDITION_FAILED',
            message: 'Boj není aktivní',
          });
        }
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          { $set: { combat: null, lastModified: now } },
        );
        return;
      }

      case 'combat.reorder': {
        // 10.2f-2 — přeřazení order ZA běžícího boje; round + currentTokenId
        // se NEMĚNÍ (na rozdíl od combat.start). orderTokenIds musí být
        // permutace stávajícího order (stejná množina i délka).
        const combat = scene.combat as {
          isActive?: boolean;
          order?: string[];
        } | null;
        if (!combat?.isActive) {
          throw new ConflictException({
            code: 'MAP_OP_PRECONDITION_FAILED',
            message: 'Boj není aktivní',
          });
        }
        const oldOrder = combat.order ?? [];
        if (op.orderTokenIds.length !== oldOrder.length) {
          throw new BadRequestException({
            code: 'MAP_OP_INVALID',
            message: `orderTokenIds (${op.orderTokenIds.length}) ≠ combat.order (${oldOrder.length}) — musí být permutace`,
          });
        }
        const oldSet = new Set(oldOrder);
        for (const id of op.orderTokenIds) {
          if (!oldSet.has(id)) {
            throw new BadRequestException({
              code: 'MAP_OP_INVALID',
              message: `Token ${id} v orderTokenIds není v combat.order`,
            });
          }
        }
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              'combat.order': op.orderTokenIds,
              lastModified: now,
            },
          },
        );
        return;
      }

      case 'combat.effect.add': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $push: {
              'combat.endOfTurnEffects': op.effect,
            },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'combat.effect.remove': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $pull: {
              'combat.endOfTurnEffects': { id: op.effectId },
            },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'npcTemplate.add': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $push: {
              npcTemplates: op.template as unknown as Record<string, unknown>,
            },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'npcTemplate.remove': {
        // Cascade — smazat template + všechny tokeny instancované z ní (1 updateOne).
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $pull: {
              npcTemplates: { id: op.templateId },
              tokens: { templateId: op.templateId },
            },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'npcTemplate.update': {
        const setFields: Record<string, unknown> = { lastModified: now };
        for (const key of Object.keys(op.patch)) {
          setFields[`npcTemplates.$.${key}`] = op.patch[key];
        }
        const result = await this.mapsRepo.atomicUpdate(
          { _id: sceneId, 'npcTemplates.id': op.templateId },
          { $set: setFields },
        );
        if (result.matchedCount === 0) {
          throw new NotFoundException({
            code: 'MAP_NPC_TEMPLATE_NOT_FOUND',
            message: 'NPC šablona nenalezena',
          });
        }
        return;
      }

      // 10.2c-edit-7 — vyčistit scénu od všech tokenů + ukončit combat (idempotent)
      case 'scene.tokens.clear': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $set: {
              tokens: [],
              combat: null,
              lastModified: now,
            },
          },
        );
        return;
      }

      // 10.2c-edit-7 — universal replace tokenů + combat (inverse pro clear)
      case 'scene.tokens.replace': {
        const setFields: Record<string, unknown> = {
          tokens: op.tokens,
          lastModified: now,
        };
        if (op.combat !== undefined) {
          setFields.combat = op.combat;
        }
        await this.mapsRepo.atomicUpdate({ _id: sceneId }, { $set: setFields });
        return;
      }

      // 10.2c-edit-7 — per-scéna whitelist Character.id; $addToSet idempotent
      case 'scene.activeCharacters.add': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $addToSet: { activeCharacterIds: op.characterId },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'scene.activeCharacters.remove': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $pull: { activeCharacterIds: op.characterId },
            $set: { lastModified: now },
          },
        );
        return;
      }

      // 10.2c-edit-7 — per-scéna whitelist Bestie.id
      case 'scene.activeBestie.add': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $addToSet: { activeBestieIds: op.bestieId },
            $set: { lastModified: now },
          },
        );
        return;
      }

      case 'scene.activeBestie.remove': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $pull: { activeBestieIds: op.bestieId },
            $set: { lastModified: now },
          },
        );
        return;
      }

      // 10.2j B3 — append hod do diceRolls, cap na 50 posledních.
      case 'dice.roll': {
        await this.mapsRepo.atomicUpdate(
          { _id: sceneId },
          {
            $push: {
              diceRolls: { $each: [op.roll], $slice: -50 },
            },
            $set: { lastModified: now },
          },
        );
        return;
      }

      default: {
        // Exhaustive check — pokud někdo přidá nový typ a zapomene case, TS catch.
        const _exhaustive: never = op;
        void _exhaustive;
        throw new BadRequestException({
          code: 'MAP_OP_INVALID',
          message: 'Neznámý typ operace (interní)',
        });
      }
    }
  }

  /**
   * 10.2d-prep-A C12 — validate systemStats v new tokenu proti per-system
   * schema (`world.system` → schema('token')). Soft mode: schema missing →
   * skip (BC s 8.x).
   */
  private async validateTokenStats(
    scene: MapScene,
    token: unknown,
    isCreate: boolean,
  ): Promise<void> {
    const tokenObj = token as { systemStats?: Record<string, unknown> };
    if (!tokenObj.systemStats) return;
    const world = await this.worldsRepo.findById(scene.worldId);
    const systemId = (world as { system?: string } | null)?.system;
    if (!systemId) return; // BC: pre-multi-system worlds
    const result = isCreate
      ? this.statsValidator.validateForCreate(
          tokenObj.systemStats,
          systemId,
          'token',
        )
      : this.statsValidator.validateForPatch(
          tokenObj.systemStats,
          systemId,
          'token',
        );
    // Soft mode: schema pro daný systém chybí (errors._schema) → skip
    // (BC; konzistentní s bestiae). Reálná data-chyba (schema existuje)
    // dál throwne.
    if (!result.valid && !result.errors._schema) {
      throw new BadRequestException({
        code: 'MAP_TOKEN_STATS_INVALID',
        message: 'systemStats validation failed',
        errors: result.errors,
      });
    }
    // Update with filled defaults (create only).
    if (isCreate) {
      tokenObj.systemStats = result.filled;
    }
  }

  /** Patch variant — strict mode (unknown keys reject). */
  private async validateTokenStatsPatch(
    scene: MapScene,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const world = await this.worldsRepo.findById(scene.worldId);
    const systemId = (world as { system?: string } | null)?.system;
    if (!systemId) return;
    const result = this.statsValidator.validateForPatch(
      patch,
      systemId,
      'token',
    );
    // Soft mode: schema chybí → skip (viz validateTokenStats).
    if (!result.valid && !result.errors._schema) {
      throw new BadRequestException({
        code: 'MAP_TOKEN_STATS_INVALID',
        message: 'systemStats patch validation failed',
        errors: result.errors,
      });
    }
  }
}
