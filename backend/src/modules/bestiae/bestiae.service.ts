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
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { CreateBestieDto } from './dto/create-bestie.dto';
import type { UpdateBestieDto } from './dto/update-bestie.dto';
import type { CloneBestieDto } from './dto/clone-bestie.dto';
import type { CreateCommunityBestieDto } from './dto/create-community-bestie.dto';
import type { UpdateBestieLoreDto } from './dto/update-bestie-lore.dto';
import type { CloneCommunityBestieDto } from './dto/clone-community-bestie.dto';
import type { ProposeStatblockDto } from './dto/propose-statblock.dto';
import { isBestieCurator } from './curator-roles';
import type { Bestie } from './interfaces/bestie.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
// 22.4 — vitrína: brána anonymního čtení world bestiáře.
import { assertShowcaseViewable } from '../../common/utils/showcase';
import { assertUnderCreationLimit } from '../../common/limits/creation-limits';

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
    // 22.4 vitrína — world lookup pro bránu anonymního čtení.
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
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
    user: CurrentUser | undefined,
    worldId?: string,
  ): Promise<BestiarResponse> {
    if (!user) {
      // 22.4 vitrína — anonym: JEN world bestiář vitrínového světa (+ systémové
      // podklady). Bez worldId není co vitrínově číst → 403.
      if (!worldId) {
        throw new ForbiddenException({
          code: 'SHOWCASE_DISABLED',
          message: 'Bestiář je dostupný jen přihlášeným.',
        });
      }
      assertShowcaseViewable(await this.worldsRepo.findById(worldId));
      // POZOR: userId '' (ne undefined) — mongoose by undefined v $or stripnul
      // a user-scope větev by matchla VŠECHNY osobní bestie (leak).
      const items = await this.repo.findVisible({
        systemId,
        userId: '',
        worldId,
      });
      return {
        system: items.filter((i) => i.scope === 'system'),
        user: [],
        world: items.filter((i) => i.scope === 'world'),
      };
    }
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

  async findById(id: string, user: CurrentUser | undefined): Promise<Bestie> {
    const bestie = await this.repo.findById(id);
    if (!bestie) throw new NotFoundException('Bestie nenalezena');
    // B5 (spec 20B) — moderačně skrytá bestie (M2/M3): vidí ji jen platform
    // reviewer (Admin+). Ostatním (i anonymovi, 22.4) 404, aby se neprozradila
    // existence.
    if (bestie.moderationHidden && (!user || !this.isGlobalAdmin(user))) {
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
      // D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: kumulativní strop
      // world-scope bestií per svět.
      assertUnderCreationLimit(
        await this.repo.countByWorldId(dto.worldId),
        'MAX_BESTIAE_PER_WORLD',
        'bestií ve světě',
      );
    }
    if (dto.scope === 'user') {
      // D-SEC-GAP-2026-07-11 — kumulativní strop osobního bestiáře per účet.
      assertUnderCreationLimit(
        await this.repo.countByOwner(user.id),
        'MAX_BESTIAE_PER_USER',
        'bestií v osobním bestiáři',
      );
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
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
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
      imageBytes: source.imageBytes, // D-19.2 — pár k imageUrl (sdílený blob)
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

  // ═══════════ 16.2b-2 — Komunitní (globální) bestiář ═══════════
  // Cross-system katalog ve Společné tvorbě. Vlastní cesta (list je jinak
  // per-systemId). Staty jen přes schvalovací tok — viz BE-2b (spec §2a).

  /** Dvě knihovny (approved / draft) — cross-system; filtr kind/systemId. */
  async listCommunity(filter: {
    status?: 'draft' | 'approved';
    kind?: string;
    systemId?: string;
  }): Promise<Bestie[]> {
    return this.repo.findCommunity(filter);
  }

  /** Detail komunitní bytosti (veřejné čtení; skrytou vidí jen Admin+). */
  async findCommunityById(id: string, user: CurrentUser): Promise<Bestie> {
    const bestie = await this.repo.findById(id);
    if (!bestie || bestie.scope !== 'community') {
      throw new NotFoundException('Bestie nenalezena');
    }
    if (bestie.moderationHidden && !this.isGlobalAdmin(user)) {
      throw new NotFoundException('Bestie nenalezena');
    }
    return bestie;
  }

  /**
   * Založí komunitní bytost jako NÁVRH (draft) + první pravidlovou verzi.
   * Autor ji hned dostane i do svého osobního (user) bestiáře (spec §5).
   */
  async createCommunity(
    dto: CreateCommunityBestieDto,
    user: CurrentUser,
  ): Promise<Bestie> {
    // D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: community návrh vždy
    // klonuje i user-scope kopii autorovi → strop osobního bestiáře brzdí
    // i flood community draftů.
    assertUnderCreationLimit(
      await this.repo.countByOwner(user.id),
      'MAX_BESTIAE_PER_USER',
      'bestií v osobním bestiáři',
    );
    const result = await this.validateStats(
      dto.systemStats,
      { scope: 'community', systemId: dto.systemId },
      'create',
    );
    if (!result.valid && !result.errors._schema) {
      throw new BadRequestException({
        code: 'BESTIE_STATS_INVALID',
        errors: result.errors,
      });
    }
    const now = new Date();
    const created = await this.repo.create({
      scope: 'community',
      systemId: dto.systemId,
      name: dto.name,
      latin: dto.latin,
      kind: dto.kind,
      tags: dto.tags,
      imageUrl: dto.imageUrl,
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
      imageFocalX: dto.imageFocalX,
      imageFocalY: dto.imageFocalY,
      imageZoom: dto.imageZoom,
      imageFit: dto.imageFit,
      notes: '',
      description: dto.description ?? '',
      // Community nepoužívá top-level systemStats — reálné staty jsou ve statblocks.
      systemStats: {},
      status: 'draft',
      authorId: user.id,
      statblocks: {
        [dto.systemId]: {
          systemStats: result.filled,
          status: 'draft',
          authorId: user.id,
          createdAt: now,
        },
      },
    });
    // Autor má návrh hned u sebe (osobní bestiář), i než projde schválením.
    await this.cloneStatblockToBestiary(
      created,
      dto.systemId,
      'user',
      undefined,
      created.name,
      user,
    );
    this.emitChanged(created);
    return created;
  }

  /** Úprava lore (text/obrázek). STATY tudy NEJDOU (spec §2a). */
  async updateCommunityLore(
    id: string,
    dto: UpdateBestieLoreDto,
    user: CurrentUser,
  ): Promise<Bestie> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.scope !== 'community') {
      throw new NotFoundException();
    }
    // Lore upraví autor nebo kurátor (správci diskusí/článků + Admin/Superadmin).
    if (existing.authorId !== user.id && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'BESTIE_NOT_AUTHOR',
        message: 'Upravit popis může jen autor nebo správce.',
      });
    }
    const updated = await this.repo.updateAtomic(id, {
      name: dto.name,
      latin: dto.latin,
      kind: dto.kind,
      tags: dto.tags,
      imageUrl: dto.imageUrl,
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
      imageFocalX: dto.imageFocalX,
      imageFocalY: dto.imageFocalY,
      imageZoom: dto.imageZoom,
      imageFit: dto.imageFit,
      description: dto.description,
    });
    if (!updated) throw new NotFoundException();
    // Úklid starého blobu při výměně obrázku (parity s update()).
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

  /** „Vlož do mého bestiáře" — klon JEDNÉ pravidlové verze do světa/osobního. */
  async cloneCommunity(
    sourceId: string,
    dto: CloneCommunityBestieDto,
    user: CurrentUser,
  ): Promise<Bestie> {
    const source = await this.repo.findById(sourceId);
    if (!source || source.scope !== 'community') throw new NotFoundException();
    if (source.moderationHidden && !this.isGlobalAdmin(user)) {
      throw new NotFoundException();
    }
    if (!source.statblocks?.[dto.systemId]) {
      throw new BadRequestException({
        code: 'BESTIE_STATBLOCK_MISSING',
        message: 'Pro tento systém zatím nejsou staty.',
      });
    }
    if (dto.scope === 'world') {
      if (!dto.worldId) {
        throw new BadRequestException(
          'worldId required for clone target world',
        );
      }
      await this.assertCanManageWorld(dto.worldId, user);
    }
    return this.cloneStatblockToBestiary(
      source,
      dto.systemId,
      dto.scope,
      dto.scope === 'world' ? dto.worldId : undefined,
      dto.newName ?? source.name,
      user,
    );
  }

  /** Interní: single-system bestie z jedné pravidlové verze (snapshot). */
  private async cloneStatblockToBestiary(
    source: Bestie,
    systemId: string,
    scope: 'user' | 'world',
    worldId: string | undefined,
    name: string,
    user: CurrentUser,
  ): Promise<Bestie> {
    const sb = source.statblocks?.[systemId];
    const cloned = await this.repo.create({
      scope,
      systemId,
      ownerUserId: scope === 'user' ? user.id : undefined,
      worldId: scope === 'world' ? worldId : undefined,
      name,
      imageUrl: source.imageUrl,
      imageBytes: source.imageBytes, // D-19.2 — pár k imageUrl (sdílený blob)
      imageFocalX: source.imageFocalX,
      imageFocalY: source.imageFocalY,
      imageZoom: source.imageZoom,
      imageFit: source.imageFit,
      notes: '',
      description: source.description,
      // Schopnosti jsou v `systemStats.abilities` → snapshot je přebírá.
      systemStats: { ...(sb?.systemStats ?? {}) },
      clonedFromId: source.id,
    });
    this.emitChanged(cloned);
    return cloned;
  }

  /**
   * Návrh / kurátorská úprava pravidlové verze statů (spec §2a). Prázdný systém
   * → smí navrhnout kdokoli přihlášený (draft). Existující verzi upraví jen
   * kurátor (běžný uživatel navrhuje změnu slovně v diskusi). Nový systém =
   * draft; kurátorská úprava zachová stávající stav (oprava schválené verze).
   */
  async proposeStatblock(
    id: string,
    dto: ProposeStatblockDto,
    user: CurrentUser,
  ): Promise<Bestie> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.scope !== 'community') {
      throw new NotFoundException();
    }
    const sb = existing.statblocks?.[dto.systemId];
    if (sb && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'BESTIE_STATBLOCK_EXISTS',
        message:
          'Tuhle pravidlovou verzi už někdo založil — změny navrhni v diskusi.',
      });
    }
    const result = await this.validateStats(
      dto.systemStats,
      { scope: 'community', systemId: dto.systemId },
      'create',
    );
    if (!result.valid && !result.errors._schema) {
      throw new BadRequestException({
        code: 'BESTIE_STATS_INVALID',
        errors: result.errors,
      });
    }
    const updated = await this.repo.setStatblock(id, dto.systemId, {
      systemStats: result.filled,
      status: sb?.status ?? 'draft',
      authorId: sb?.authorId ?? user.id,
      createdAt: sb?.createdAt ?? new Date(),
    });
    if (!updated) throw new NotFoundException();
    this.emitChanged(updated);
    return updated;
  }

  /** Kurátor schválí jednu pravidlovou verzi (draft → approved). */
  async approveStatblock(
    id: string,
    systemId: string,
    user: CurrentUser,
  ): Promise<Bestie> {
    this.requireCurator(user);
    const existing = await this.repo.findById(id);
    if (!existing || existing.scope !== 'community') {
      throw new NotFoundException();
    }
    if (!existing.statblocks?.[systemId]) {
      throw new BadRequestException({
        code: 'BESTIE_STATBLOCK_MISSING',
        message: 'Pro tento systém nejsou staty.',
      });
    }
    const updated = await this.repo.setStatblockStatus(
      id,
      systemId,
      'approved',
    );
    if (!updated) throw new NotFoundException();
    this.emitChanged(updated);
    return updated;
  }

  /** Kurátor schválí bytost → přejde z knihovny návrhů do schválené. */
  async approveBeast(id: string, user: CurrentUser): Promise<Bestie> {
    this.requireCurator(user);
    const existing = await this.repo.findById(id);
    if (!existing || existing.scope !== 'community') {
      throw new NotFoundException();
    }
    const updated = await this.repo.updateAtomic(id, {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: user.id,
    });
    if (!updated) throw new NotFoundException();
    this.emitChanged(updated);
    return updated;
  }

  // ───────── Authorization helpers ─────────

  private async assertCanRead(
    bestie: Bestie,
    user: CurrentUser | undefined,
  ): Promise<void> {
    if (bestie.scope === 'system') return;
    if (!user) {
      // 22.4 vitrína — anonym: world-scope jen přes zapnuté veřejné nahlížení,
      // osobní (user-scope) bestie nikdy.
      if (bestie.scope === 'world' && bestie.worldId) {
        assertShowcaseViewable(await this.worldsRepo.findById(bestie.worldId));
        return;
      }
      throw new ForbiddenException({
        code: 'SHOWCASE_DISABLED',
        message: 'Tahle bestie je dostupná jen přihlášeným.',
      });
    }
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
    // 16.2b-2 — community: autor smí měnit/smazat JEN svůj návrh (draft),
    // kurátor/admin cokoli. Bez téhle větve `assertCanWrite` u community
    // propadala bez výjimky → generický `DELETE /bestiae/:id` pouštěl KOHOKOLI
    // smazat i schválené community bestie (IDOR). Sjednoceno s ostatními 7
    // katalogy (plants/potions/spells/riddles/items/price-lists/name-sets).
    if (bestie.scope === 'community') {
      const isAuthorDraft =
        bestie.authorId === user.id && bestie.status === 'draft';
      if (!isAuthorDraft && !this.isCurator(user)) {
        throw new ForbiddenException({
          code: 'BESTIE_NOT_AUTHOR',
          message: 'Bestii může měnit jen autor (návrh) nebo správce.',
        });
      }
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
   * 16.2b-2 — kurátor komunitního bestiáře = správci diskusí/článků +
   * Admin/Superadmin (`curator-roles.ts`, sdíleno s review providerem).
   */
  private isCurator(user: CurrentUser): boolean {
    return isBestieCurator(user.role);
  }

  private requireCurator(user: CurrentUser): void {
    if (!this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'BESTIE_NOT_CURATOR',
        message:
          'Na tohle potřebuješ být správce diskusí, článků nebo platformy.',
      });
    }
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
