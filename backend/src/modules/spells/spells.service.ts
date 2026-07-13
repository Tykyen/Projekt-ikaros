/**
 * 21.5c — Spells service (kouzla, komunitní katalog).
 *
 * Kostra: plants.service (community-only) + statblocky z bestiae.service
 * (propose/approve — dvě knihovny kouzel a per-systém „balancnuté" verze).
 * Kurátoři (správci diskusí/článků + Admin/Superadmin) schvalují a moderují —
 * reuse `isBestieCurator` (`curator-roles.ts`), stejná množina rolí.
 * `systemStats` se nevaliduje proti schématu (kouzla entity-schema nemají) —
 * šablony polí vynucuje FE formulář (spec-21.5c R6).
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SpellsRepository } from './repositories/spells.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import { UserRole } from '../users/interfaces/user.interface';
import type { CurrentUser, Spell } from './interfaces/spell.interface';
import type { CreateCommunitySpellDto } from './dto/create-community-spell.dto';
import type { UpdateSpellLoreDto } from './dto/update-spell-lore.dto';
import type { ProposeSpellStatblockDto } from './dto/propose-spell-statblock.dto';

@Injectable()
export class SpellsService {
  constructor(
    private readonly repo: SpellsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Čtení katalogu (dvě knihovny přes `status`, filtr systém/tag).
   * Moderačně skrytá kouzla vidí v listu jen Admin+ (`includeHidden`).
   */
  async list(
    filter: { status?: 'draft' | 'approved'; systemId?: string; tag?: string },
    user: CurrentUser,
  ): Promise<Spell[]> {
    return this.repo.findMany({
      ...filter,
      includeHidden: this.isGlobalAdmin(user),
    });
  }

  /** Detail kouzla (skryté vidí jen Admin+ — ostatním 404, neprozradit existenci). */
  async findById(id: string, user: CurrentUser): Promise<Spell> {
    const spell = await this.repo.findById(id);
    if (!spell) throw this.notFound();
    if (spell.moderationHidden && !this.isGlobalAdmin(user))
      throw this.notFound();
    return spell;
  }

  /** Založí kouzlo jako NÁVRH (draft) + první statblok (draft). */
  async create(
    dto: CreateCommunitySpellDto,
    user: CurrentUser,
  ): Promise<Spell> {
    return this.repo.create({
      scope: 'community',
      systemId: dto.systemId,
      name: dto.name,
      aliases: dto.aliases,
      imageUrl: dto.imageUrl,
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
      imageFocalX: dto.imageFocalX,
      imageFocalY: dto.imageFocalY,
      imageZoom: dto.imageZoom,
      imageFit: dto.imageFit,
      description: dto.description ?? '',
      tags: dto.tags,
      status: 'draft',
      authorId: user.id,
      statblocks: {
        [dto.systemId]: {
          systemStats: dto.systemStats,
          status: 'draft',
          authorId: user.id,
          createdAt: new Date(),
        },
      },
    });
  }

  /** Úprava lore (jádro: název/oznámení/obrázek/štítky). STATY tudy NEjdou. */
  async updateLore(
    id: string,
    dto: UpdateSpellLoreDto,
    user: CurrentUser,
  ): Promise<Spell> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (existing.authorId !== user.id && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'SPELL_NOT_AUTHOR',
        message: 'Upravit kouzlo může jen autor nebo správce.',
      });
    }
    // D-071 — výměna obrázku: starý blob by osiřel na Cloudinary. Emit PŘED
    // zápisem (best-effort úklid; listener ne-Cloudinary URL ignoruje).
    if (
      dto.imageUrl !== undefined &&
      existing.imageUrl &&
      dto.imageUrl !== existing.imageUrl
    ) {
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    }
    // `dto` nese jen odeslaná pole; mongoose strip undefined v `$set` →
    // partial update. `statblocks`/`status`/`authorId` DTO neobsahuje.
    const updated = await this.repo.update(id, { ...dto });
    if (!updated) throw this.notFound();
    return updated;
  }

  /**
   * Návrh / kurátorská úprava pravidlové verze (vzor bestiae §2a). Prázdný
   * systém → smí navrhnout kdokoli přihlášený (draft). Existující verzi upraví
   * jen kurátor (běžný uživatel navrhuje změnu v diskusi ke statbloku).
   * Kurátorská úprava zachová stávající stav (oprava schválené verze).
   */
  async proposeStatblock(
    id: string,
    dto: ProposeSpellStatblockDto,
    user: CurrentUser,
  ): Promise<Spell> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const sb = existing.statblocks?.[dto.systemId];
    if (sb && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'SPELL_STATBLOCK_EXISTS',
        message:
          'Tuhle pravidlovou verzi už někdo založil — změny navrhni v diskusi.',
      });
    }
    const updated = await this.repo.setStatblock(id, dto.systemId, {
      systemStats: dto.systemStats,
      status: sb?.status ?? 'draft',
      authorId: sb?.authorId ?? user.id,
      createdAt: sb?.createdAt ?? new Date(),
    });
    if (!updated) throw this.notFound();
    return updated;
  }

  /** Kurátor schválí jednu pravidlovou verzi (draft → approved = balancnuté). */
  async approveStatblock(
    id: string,
    systemId: string,
    user: CurrentUser,
  ): Promise<Spell> {
    this.requireCurator(user);
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (!existing.statblocks?.[systemId]) {
      throw new BadRequestException({
        code: 'SPELL_STATBLOCK_MISSING',
        message: 'Pro tento systém nejsou staty.',
      });
    }
    const updated = await this.repo.setStatblockStatus(
      id,
      systemId,
      'approved',
    );
    if (!updated) throw this.notFound();
    return updated;
  }

  /** Kurátor schválí kouzlo (draft → approved, přesun do schválené knihovny). */
  async approve(id: string, user: CurrentUser): Promise<Spell> {
    this.requireCurator(user);
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const updated = await this.repo.setStatus(id, 'approved', {
      approvedAt: new Date(),
      approvedBy: user.id,
    });
    if (!updated) throw this.notFound();
    return updated;
  }

  /** Smaže kouzlo. Autor jen svůj NÁVRH (draft); kurátor cokoli. */
  async remove(id: string, user: CurrentUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const isAuthorDraft =
      existing.authorId === user.id && existing.status === 'draft';
    if (!isAuthorDraft && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'SPELL_NOT_AUTHOR',
        message: 'Smazat kouzlo může jen autor (návrh) nebo správce.',
      });
    }
    // D-071 — hard-delete s obrázkem: blob by osiřel na Cloudinary → emit
    // `media.orphaned` (stejný úklid jako bestiae/plants).
    if (existing.imageUrl)
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    await this.repo.delete(id);
  }

  /**
   * Moderační skrytí/odkrytí (parity s bestiae/plants). Bez autorské/role brány
   * (autorizuje moderační cesta) — volá `SpellsModerationEnforcementListener`.
   */
  async moderationSetHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.setModeration(id, hidden, reason);
    return updated !== null;
  }

  /** Moderační smazání (M4). Kouzla nemají soft-delete → hard delete. */
  async moderationRemove(id: string): Promise<boolean> {
    const existing = await this.repo.findById(id);
    if (!existing) return false;
    if (existing.imageUrl)
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    await this.repo.delete(id);
    return true;
  }

  // ───────── Authorization helpers ─────────

  // elevation-exempt: katalog je čistě globální/platformový (žádný world scope),
  // tohle je platform-admin gate — ne world bypass přes worldAdminBypass.
  private isGlobalAdmin(user: CurrentUser): boolean {
    return user.role === UserRole.Superadmin || user.role === UserRole.Admin;
  }

  /** Kurátor kouzel = správci diskusí/článků + Admin/Superadmin (reuse bestiae). */
  private isCurator(user: CurrentUser): boolean {
    return isBestieCurator(user.role);
  }

  private requireCurator(user: CurrentUser): void {
    if (!this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'SPELL_NOT_CURATOR',
        message:
          'Na tohle potřebuješ být správce diskusí, článků nebo platformy.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'SPELL_NOT_FOUND',
      message: 'Kouzlo nenalezeno.',
    });
  }
}
