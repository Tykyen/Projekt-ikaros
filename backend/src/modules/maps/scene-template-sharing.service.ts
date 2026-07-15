import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { IMapTemplatesRepository } from './interfaces/map-templates-repository.interface';
import type { MapTemplate } from './interfaces/map-template.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { ContentLicensesService } from '../content-licenses/content-licenses.service';
import type { LicenseMode } from '../content-licenses/interfaces/content-license.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { isBestieCurator } from '../bestiae/curator-roles';
import type { PublishSceneTemplateDto } from './dto/publish-scene-template.dto';

/** Podmínky (verze) přijaté při publikaci — pro licenční kartu. */
const TERMS_VERSION = '1.0';

interface Requester {
  id: string;
  role: UserRole;
}

/**
 * 22.5 — sdílení scén: publikace šablony (`mapTemplates`) do veřejného katalogu,
 * kurátorský tok (draft→approved), moderační skrytí a katalogové čtení.
 *
 * Bezpečnost: publish/unpublish = jen vlastník (Admin+ bypass); approve/reject =
 * kurátor (`isBestieCurator`); katalog vrací JEN published∧approved∧¬hidden přes
 * whitelist mapper (bez owner-privátních polí). PC tokeny šablona nikdy nenese
 * (`filterOutPcTokens` při save), proto klon je leak-safe.
 */
@Injectable()
export class SceneTemplateSharingService {
  constructor(
    @Inject('IMapTemplatesRepository')
    private readonly repo: IMapTemplatesRepository,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
    private readonly licenses: ContentLicensesService,
  ) {}

  // ── Publikace ──────────────────────────────────────────────────────────

  async publish(
    id: string,
    dto: PublishSceneTemplateDto,
    requester: Requester,
  ): Promise<MapTemplate> {
    const tpl = await this.getOwnedOrAdmin(id, requester);
    if (!tpl.imageUrl || !tpl.config) {
      throw new BadRequestException({
        code: 'TEMPLATE_INCOMPLETE',
        message: 'Šablonu bez mapy nebo konfigurace nelze publikovat.',
      });
    }

    const author = await this.usersRepo.findById(tpl.ownerId);
    const publicAuthorName =
      author?.displayName || author?.username || 'Neznámý autor';
    const mode: LicenseMode = dto.licenseMode ?? 'clone';
    const cloneAllowed =
      mode === 'clone' || mode === 'remix' || mode === 'open';

    // Licenční karta (20D) — contentId = id šablony. Idempotence: pokud už
    // karta existuje (re-publish), zapíšeme novou verzi (změna režimu).
    const existing = await this.licenses.getLatest(id);
    if (existing) {
      await this.licenses.changeMode(id, {
        licenseMode: mode,
        cloneAllowed,
        aiOrigin: dto.aiOrigin ?? existing.aiOrigin,
        attributionRequired: dto.attributionRequired ?? true,
        publicAuthorName,
      });
    } else {
      await this.licenses.create({
        contentId: id,
        ownerUserId: tpl.ownerId,
        publicAuthorName,
        licenseMode: mode,
        cloneAllowed,
        derivativesAllowed: mode === 'remix' || mode === 'open',
        exportAllowed: cloneAllowed,
        aiOrigin: dto.aiOrigin ?? 'A6',
        thirdPartyStatus: 'unknown',
        attributionRequired: dto.attributionRequired ?? true,
        reviewStatus: 'pending',
        acceptedTermsVersion: TERMS_VERSION,
        parentContentId: tpl.clonedFromTemplateId ?? undefined,
      });
    }

    // Publikace: strip zvuků (OO1 — activeSoundIds jsou svět-scoped → mrtvé
    // v cizím světě), snapshot autorství, čeká na kurátora.
    const updated = await this.repo.patch(id, {
      published: true,
      publishedAt: new Date(),
      authorId: tpl.ownerId,
      publicAuthorName,
      reviewStatus: 'pending',
      moderationHidden: false,
      moderationHiddenReason: null,
      licenseId: id,
      activeSoundIds: [],
    });
    if (!updated)
      throw new NotFoundException({ code: 'MAP_TEMPLATE_NOT_FOUND' });
    return updated;
  }

  async unpublish(id: string, requester: Requester): Promise<MapTemplate> {
    await this.getOwnedOrAdmin(id, requester);
    await this.licenses.changeMode(id, { licenseMode: 'withdrawn' });
    const updated = await this.repo.patch(id, {
      published: false,
      reviewStatus: null,
    });
    if (!updated)
      throw new NotFoundException({ code: 'MAP_TEMPLATE_NOT_FOUND' });
    // Existující klony (scény ve světech) zůstávají — jsou to nezávislé snapshoty.
    return updated;
  }

  // ── Katalog (login-required, whitelist) ────────────────────────────────

  async listCatalog(opts?: {
    systemId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: CatalogEntry[]; total: number }> {
    const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 60);
    const skip = Math.max(0, ((opts?.page ?? 1) - 1) * limit);
    const [tpls, total] = await Promise.all([
      this.repo.findCatalog({ systemId: opts?.systemId, skip, limit }),
      this.repo.countCatalog({ systemId: opts?.systemId }),
    ]);
    return { items: tpls.map(toCatalogEntry), total };
  }

  async getCatalogEntry(id: string): Promise<CatalogEntry> {
    const tpl = await this.repo.findById(id);
    if (
      !tpl ||
      !tpl.published ||
      tpl.reviewStatus !== 'approved' ||
      tpl.moderationHidden === true
    ) {
      throw new NotFoundException({
        code: 'SCENE_TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    return toCatalogEntry(tpl);
  }

  // ── Kurátorský tok ─────────────────────────────────────────────────────

  async approve(id: string, requester: Requester): Promise<MapTemplate> {
    this.assertCurator(requester);
    const updated = await this.repo.patch(id, { reviewStatus: 'approved' });
    if (!updated)
      throw new NotFoundException({ code: 'MAP_TEMPLATE_NOT_FOUND' });
    return updated;
  }

  async reject(id: string, requester: Requester): Promise<MapTemplate> {
    this.assertCurator(requester);
    const updated = await this.repo.patch(id, {
      reviewStatus: 'rejected',
      published: false,
    });
    if (!updated)
      throw new NotFoundException({ code: 'MAP_TEMPLATE_NOT_FOUND' });
    return updated;
  }

  // ── Moderační enforcement (volá jen listener, bez role brány) ───────────

  async moderationSetHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.patch(id, {
      moderationHidden: hidden,
      moderationHiddenReason: hidden ? (reason ?? null) : null,
    });
    return updated !== null;
  }

  async moderationRemove(id: string): Promise<boolean> {
    // Šablona nemá soft-delete; M4 = stažení z katalogu (published=false) +
    // skrytí. Fyzické smazání ponecháme autorovi (klony nezávislé).
    const updated = await this.repo.patch(id, {
      published: false,
      moderationHidden: true,
    });
    return updated !== null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async getOwnedOrAdmin(
    id: string,
    requester: Requester,
  ): Promise<MapTemplate> {
    const tpl = await this.repo.findById(id);
    if (!tpl) {
      throw new NotFoundException({
        code: 'MAP_TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    // Knihovna je cross-world per-owner (bez worldId) → jen vlastník nebo
    // platform Admin+ (žádná world elevation, parita s map-templates.controller).
    // elevation-exempt: cross-world per-owner šablony (bez worldId) — nelze
    // worldAdminBypass, owner check je autorita.
    if (requester.role > UserRole.Admin && tpl.ownerId !== requester.id) {
      throw new ForbiddenException({
        code: 'MAP_TEMPLATE_FORBIDDEN_OWNER',
        message: 'Šablona patří jinému PJ',
      });
    }
    return tpl;
  }

  private assertCurator(requester: Requester): void {
    if (!isBestieCurator(requester.role)) {
      throw new ForbiddenException({
        code: 'NOT_CURATOR',
        message: 'Na schvalování šablon nemáš oprávnění.',
      });
    }
  }
}

/** Katalogový záznam — whitelist bez owner-privátních polí (žádný raw ownerId). */
export interface CatalogEntry {
  id: string;
  name: string;
  imageUrl: string;
  publicAuthorName: string;
  publishedAt: Date | null;
  npcCount: number;
  hasFog: boolean;
  cloneAllowed?: boolean;
}

export function toCatalogEntry(tpl: MapTemplate): CatalogEntry {
  return {
    id: tpl.id,
    name: tpl.name,
    imageUrl: tpl.imageUrl,
    publicAuthorName: tpl.publicAuthorName ?? 'Neznámý autor',
    publishedAt: tpl.publishedAt ?? null,
    npcCount: tpl.npcTemplates?.length ?? 0,
    hasFog: tpl.fogEnabled ?? false,
  };
}
