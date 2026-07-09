/**
 * 10.2d-prep-B — Bestiae service.
 *
 * - Visibility query 3-scope (system + user (mine) + world (current))
 * - Authorize per scope (system read-only via API; user owner-only;
 *   world PJ+)
 * - systemStats validate přes prep-A SystemStatsValidatorService
 * - Clone (system → user/world, user → user/world, world → user/world)
 *
 * Spec: docs/arch/phase-10/spec-10.2d-prep-B.md.
 */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { BestiaeRepository } from './repositories/bestiae.repository';
import { SystemStatsValidatorService } from '../maps/schemas/system-entity-schema/system-stats-validator.service';
import type { ValidationResult } from '../maps/schemas/system-entity-schema/system-entity-schema.types';
import { EntitySchemaVersionsService } from '../entity-schema-versions/entity-schema-versions.service';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { CreateBestieDto } from './dto/create-bestie.dto';
import type { UpdateBestieDto } from './dto/update-bestie.dto';
import type { CloneBestieDto } from './dto/clone-bestie.dto';
import type { Bestie } from './interfaces/bestie.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';

export interface BestiarResponse {
  system: Bestie[];
  user: Bestie[];
  world: Bestie[];
}

interface CurrentUser {
  id: string;
  role: UserRole;
  elevatedWorldIds?: string[];
}

@Injectable()
export class BestiaeService {
  constructor(
    private readonly repo: BestiaeRepository,
    private readonly statsValidator: SystemStatsValidatorService,
    @Inject('IWorldMembershipRepository')
    private readonly memberRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly entitySchemas: EntitySchemaVersionsService,
  ) {}

  /**
   * 16.2g F2 — validace `systemStats`. World-scoped bestie ve světě s vlastní
   * šablonou bestie (`entity_schema_versions`) se validuje proti ní; jinak
   * fallback na registry (assets). Soft-mode (`_schema`) řeší volající.
   */
  private async validateStats(
    stats: Record<string, unknown>,
    bestie: { scope: string; systemId: string; worldId?: string },
    mode: 'create' | 'patch',
  ): Promise<ValidationResult> {
    if (bestie.scope === 'world' && bestie.worldId) {
      const worldSchema = await this.entitySchemas.getActiveSchema(
        bestie.worldId,
        'bestie',
      );
      if (worldSchema) {
        return mode === 'create'
          ? this.statsValidator.validateForCreateWithSchema(stats, worldSchema)
          : this.statsValidator.validateForPatchWithSchema(stats, worldSchema);
      }
    }
    return mode === 'create'
      ? this.statsValidator.validateForCreate(stats, bestie.systemId, 'bestie')
      : this.statsValidator.validateForPatch(stats, bestie.systemId, 'bestie');
  }

  /**
   * C-34 — leak-safe signál „bestiář se změnil" pro daný scope. Klient
   * refetchne filtrovaný `GET /bestiae`. Payload nese jen routing identifikátory
   * (scope + systemId + world/owner dle scope), ne plnou bestii.
   */
  private emitChanged(bestie: Bestie): void {
    this.eventEmitter.emit('bestiae.changed', {
      scope: bestie.scope,
      worldId: bestie.scope === 'world' ? (bestie.worldId ?? null) : null,
      ownerUserId:
        bestie.scope === 'user' ? (bestie.ownerUserId ?? null) : null,
      systemId: bestie.systemId,
    });
  }

  async list(
    systemId: string,
    user: CurrentUser,
    worldId?: string,
  ): Promise<BestiarResponse> {
    // R-AUDIT (IDOR fix) — world-scoped bestie jen pro členy světa; jinak
    // enumerací `?worldId=` leakoval bestiář cizího/privátního světa. system/user
    // scope řeší vlastní brána v assertCanRead.
    if (worldId) await this.assertCanReadWorld(worldId, user);
    const items = await this.repo.findVisible({
      systemId,
      userId: user.id,
      worldId,
    });
    return {
      system: items.filter((i) => i.scope === 'system'),
      user: items.filter((i) => i.scope === 'user'),
      world: items.filter((i) => i.scope === 'world'),
    };
  }

  async findById(id: string, user: CurrentUser): Promise<Bestie> {
    const bestie = await this.repo.findById(id);
    if (!bestie) throw new NotFoundException('Bestie nenalezena');
    // B5 (spec 20B) — moderačně skrytá bestie (M2/M3): vidí ji jen platform
    // reviewer (Admin+). Ostatním 404, aby se neprozradila existence.
    if (bestie.moderationHidden && !this.isGlobalAdmin(user)) {
      throw new NotFoundException('Bestie nenalezena');
    }
    await this.assertCanRead(bestie, user);
    return bestie;
  }

  async create(dto: CreateBestieDto, user: CurrentUser): Promise<Bestie> {
    // Scope-specific guards.
    if (dto.scope === 'world') {
      if (!dto.worldId) {
        throw new BadRequestException('worldId required for scope=world');
      }
      await this.assertCanManageWorld(dto.worldId, user);
    }
    if (dto.scope === 'system') {
      // Globální (systémový) bestiář spravuje jen platformový Admin/Superadmin.
      if (!this.isGlobalAdmin(user)) {
        throw new ForbiddenException({
          code: 'SYSTEM_BESTIE_READ_ONLY',
          message:
            'Systémové bestie zakládá jen správce platformy — můžeš si udělat vlastní.',
        });
      }
    }
    // Validate systemStats proti per-system bestie schema.
    // Soft mode (konzistentní s token ops C12): pokud BE nemá schema pro
    // daný systém (errors._schema), validaci přeskočíme a důvěřujeme FE —
    // jinak by šlo tvořit bestie jen pro systémy s exportovaným schématem.
    const result = await this.validateStats(
      dto.systemStats,
      { scope: dto.scope, systemId: dto.systemId, worldId: dto.worldId },
      'create',
    );
    if (!result.valid && !result.errors._schema) {
      throw new BadRequestException({
        code: 'BESTIE_STATS_INVALID',
        errors: result.errors,
      });
    }
    const created = await this.repo.create({
      scope: dto.scope,
      systemId: dto.systemId,
      ownerUserId: dto.scope === 'user' ? user.id : undefined,
      worldId: dto.scope === 'world' ? dto.worldId : undefined,
      name: dto.name,
      imageUrl: dto.imageUrl,
      imageFocalX: dto.imageFocalX,
      imageFocalY: dto.imageFocalY,
      imageZoom: dto.imageZoom,
      imageFit: dto.imageFit,
      notes: dto.notes ?? '',
      description: dto.description ?? '',
      systemStats: result.filled,
    });
    this.emitChanged(created);
    return created;
  }

  async update(
    id: string,
    dto: UpdateBestieDto,
    user: CurrentUser,
  ): Promise<Bestie> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException();
    await this.assertCanWrite(existing, user);

    if (dto.systemStats) {
      // Soft mode: schema chybí → skip (viz create).
      const result = await this.validateStats(
        dto.systemStats,
        {
          scope: existing.scope,
          systemId: existing.systemId,
          worldId: existing.worldId,
        },
        'patch',
      );
      if (!result.valid && !result.errors._schema) {
        throw new BadRequestException({
          code: 'BESTIE_STATS_INVALID',
          errors: result.errors,
        });
      }
    }
    const updated = await this.repo.updateAtomic(id, dto);
    if (!updated) throw new NotFoundException();
    // FIX-29 — úklid starého blobu obrázku bestie při výměně / odebrání.
    if (
      dto.imageUrl !== undefined &&
      existing.imageUrl &&
      existing.imageUrl !== dto.imageUrl
    ) {
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    }
    this.emitChanged(updated);
    return updated;
  }

  async softDelete(id: string, user: CurrentUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException();
    await this.assertCanWrite(existing, user);
    await this.repo.softDelete(id);
    // FIX-29 — NEemitujeme `media.orphaned` zde: `softDelete` je zotavitelný
    // (`POST /bestiae/:id/restore`), na rozdíl od world-news/game-events
    // (hard delete bez restore). Okamžitý úklid Cloudinary blobu by po
    // restore nechal bestii s rozbitým obrázkem. Cleanup patří až k
    // budoucímu skutečnému hard-delete (repo.hardDelete existuje, ale
    // dnes ho nevolá žádný cron/service).
    this.emitChanged(existing);
  }

  async restore(id: string, user: CurrentUser): Promise<Bestie> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException();
    await this.assertCanWrite(existing, user);
    const restored = await this.repo.restore(id);
    if (!restored) throw new NotFoundException();
    this.emitChanged(restored);
    return restored;
  }

  // ───────── B5 (spec 20B) — moderační enforcement (systémová cesta) ────────
  // Bez autorské/role brány (autorizoval už moderační zásah); idempotentní,
  // na neznámém id vrací false (listener zaloguje). Volá jen enforcement listener.

  /** M2/M3 (skrytí) a jejich revert. */
  async moderationSetHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.updateAtomic(id, {
      moderationHidden: hidden,
      moderationHiddenReason: hidden ? (reason ?? '') : '',
    });
    if (updated) this.emitChanged(updated);
    return updated !== null;
  }

  /** M4 (odstranění) — soft delete (vratné přes `moderationRestore`). */
  async moderationRemove(id: string): Promise<boolean> {
    const existing = await this.repo.findById(id);
    if (!existing) return false;
    await this.repo.softDelete(id);
    this.emitChanged(existing);
    return true;
  }

  /** Revert M4 — obnoví soft-smazanou bestii (bestiae soft delete je vratné). */
  async moderationRestore(id: string): Promise<boolean> {
    const restored = await this.repo.restore(id);
    if (restored) this.emitChanged(restored);
    return restored !== null;
  }

  async clone(
    sourceId: string,
    dto: CloneBestieDto,
    user: CurrentUser,
  ): Promise<Bestie> {
    const source = await this.repo.findById(sourceId);
    if (!source) throw new NotFoundException();
    await this.assertCanRead(source, user);

    if (dto.scope === 'world') {
      if (!dto.worldId) {
        throw new BadRequestException(
          'worldId required for clone target world',
        );
      }
      await this.assertCanManageWorld(dto.worldId, user);
    }

    const cloned = await this.repo.create({
      scope: dto.scope,
      systemId: source.systemId,
      ownerUserId: dto.scope === 'user' ? user.id : undefined,
      worldId: dto.scope === 'world' ? dto.worldId : undefined,
      name: dto.newName ?? `${source.name} (kopie)`,
      imageUrl: source.imageUrl,
      imageFocalX: source.imageFocalX,
      imageFocalY: source.imageFocalY,
      imageZoom: source.imageZoom,
      imageFit: source.imageFit,
      notes: source.notes,
      description: source.description,
      // systemStats nese i schopnosti (`systemStats.abilities`) → klon je přebírá.
      systemStats: { ...source.systemStats },
      clonedFromId: source.id,
    });
    this.emitChanged(cloned);
    return cloned;
  }

  // ───────── Authorization helpers ─────────

  private async assertCanRead(
    bestie: Bestie,
    user: CurrentUser,
  ): Promise<void> {
    if (bestie.scope === 'system') return;
    if (bestie.scope === 'user') {
      if (bestie.ownerUserId !== user.id && !this.isGlobalAdmin(user)) {
        throw new ForbiddenException({
          code: 'BESTIE_NOT_OWNER',
          message: 'Tahle bestie patří někomu jinému.',
        });
      }
      return;
    }
    if (bestie.scope === 'world') {
      await this.assertCanReadWorld(bestie.worldId!, user);
    }
  }

  /**
   * R-AUDIT — read brána pro world-scoped bestiář: člen světa nebo elevovaný
   * platform admin. Sdílená mezi `findById`/`clone` (per-bestie) a `list`
   * (dřív `list` bránu neměl → enumerací `?worldId=` leak bestiáře cizího světa).
   */
  private async assertCanReadWorld(
    worldId: string,
    user: CurrentUser,
  ): Promise<void> {
    if (worldAdminBypass(user, worldId)) return;
    const member = await this.memberRepo.findByUserAndWorld(user.id, worldId);
    if (!member)
      throw new ForbiddenException({
        code: 'NOT_A_MEMBER',
        message: 'Do tohoto světa zatím nemáš přístup.',
      });
  }

  private async assertCanWrite(
    bestie: Bestie,
    user: CurrentUser,
  ): Promise<void> {
    if (bestie.scope === 'system') {
      if (!this.isGlobalAdmin(user)) {
        throw new ForbiddenException({
          code: 'SYSTEM_BESTIE_READ_ONLY',
          message:
            'Systémové bestie se upravovat nedají — můžeš si udělat vlastní kopii.',
        });
      }
      return;
    }
    if (bestie.scope === 'user') {
      if (bestie.ownerUserId !== user.id)
        throw new ForbiddenException({
          code: 'BESTIE_NOT_OWNER',
          message: 'Tahle bestie patří někomu jinému.',
        });
      return;
    }
    if (bestie.scope === 'world') {
      await this.assertCanManageWorld(bestie.worldId!, user);
    }
  }

  private async assertCanManageWorld(
    worldId: string,
    user: CurrentUser,
  ): Promise<void> {
    if (worldAdminBypass(user, worldId)) return;
    const member = await this.memberRepo.findByUserAndWorld(user.id, worldId);
    if (!member || member.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_WORLD_ROLE',
        message: 'Na tohle potřebuješ roli Pomocný PJ nebo vyšší.',
      });
    }
  }

  // Elevation se netýká — používá se jen pro scope 'system'/'user' (globální
  // resp. osobní katalog bez worldId). World-scope brány jdou přes worldAdminBypass.
  private isGlobalAdmin(user: CurrentUser): boolean {
    return user.role === UserRole.Superadmin || user.role === UserRole.Admin;
  }

  /**
   * FIX-4 (BE oprava dávka, 2026-07) — hard-delete účtu: `scope:'user'` bestie
   * (per-PJ šablony napříč světy, bez `worldId`) nejsou ve world-hard-delete
   * cascade → jejich `imageUrl` blob by jinak navždy osiřel na Cloudinary.
   * `scope:'system'`/`'world'` bestie tenhle handler neřeší (nemají
   * `ownerUserId`, resp. řeší je world-hard-delete cascade). Best-effort,
   * konzistentní s ostatními `user.deletion.hardDeleted` listenery.
   */
  @OnEvent('user.deletion.hardDeleted')
  async handleAccountHardDeleted(payload: { userId: string }): Promise<void> {
    const urls = await this.repo.findImageUrlsByOwner(payload.userId);
    if (urls.length > 0) {
      this.eventEmitter.emit('media.orphaned', { urls });
    }
    await this.repo.deleteAllByOwner(payload.userId);
  }
}
