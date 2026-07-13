/**
 * 21.5b — Potions service (lektvary, komunitní katalog). Mirror spells.service
 * (21.5c): dvě knihovny + per-statblok schvalování (balancnuté), kurátoři =
 * isBestieCurator. `systemStats` schema-less — šablony vynucuje FE (spec R5).
 * Navíc jádro: druh (`kind`), suroviny (`ingredients`), `suggestedPrice`.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PotionsRepository } from './repositories/potions.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import { UserRole } from '../users/interfaces/user.interface';
import type { CurrentUser, Potion } from './interfaces/potion.interface';
import type { CreateCommunityPotionDto } from './dto/create-community-potion.dto';
import type { UpdatePotionLoreDto } from './dto/update-potion-lore.dto';
import type { ProposePotionStatblockDto } from './dto/propose-potion-statblock.dto';

@Injectable()
export class PotionsService {
  constructor(
    private readonly repo: PotionsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Čtení katalogu (dvě knihovny, filtr systém/druh/tag); skryté jen Admin+. */
  async list(
    filter: {
      status?: 'draft' | 'approved';
      systemId?: string;
      kind?: string;
      tag?: string;
    },
    user: CurrentUser,
  ): Promise<Potion[]> {
    return this.repo.findMany({
      ...filter,
      includeHidden: this.isGlobalAdmin(user),
    });
  }

  /** Detail (skrytý vidí jen Admin+ — ostatním 404, neprozradit existenci). */
  async findById(id: string, user: CurrentUser): Promise<Potion> {
    const potion = await this.repo.findById(id);
    if (!potion) throw this.notFound();
    if (potion.moderationHidden && !this.isGlobalAdmin(user))
      throw this.notFound();
    return potion;
  }

  /** Založí lektvar jako NÁVRH (draft) + první statblok (draft). */
  async create(
    dto: CreateCommunityPotionDto,
    user: CurrentUser,
  ): Promise<Potion> {
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
      kind: dto.kind,
      ingredients: dto.ingredients,
      description: dto.description ?? '',
      tags: dto.tags,
      suggestedPrice: dto.suggestedPrice ?? null,
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

  /** Úprava jádra (název/druh/suroviny/oznámení/obrázek/cena). STATY tudy NEjdou. */
  async updateLore(
    id: string,
    dto: UpdatePotionLoreDto,
    user: CurrentUser,
  ): Promise<Potion> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (existing.authorId !== user.id && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'POTION_NOT_AUTHOR',
        message: 'Upravit lektvar může jen autor nebo správce.',
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
   * Návrh / kurátorská úprava pravidlové verze (vzor 21.5c). Prázdný systém →
   * smí navrhnout kdokoli přihlášený (draft). Existující verzi upraví jen
   * kurátor; kurátorská úprava zachová stávající stav i autora.
   */
  async proposeStatblock(
    id: string,
    dto: ProposePotionStatblockDto,
    user: CurrentUser,
  ): Promise<Potion> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const sb = existing.statblocks?.[dto.systemId];
    if (sb && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'POTION_STATBLOCK_EXISTS',
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
  ): Promise<Potion> {
    this.requireCurator(user);
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (!existing.statblocks?.[systemId]) {
      throw new BadRequestException({
        code: 'POTION_STATBLOCK_MISSING',
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

  /** Kurátor schválí lektvar (draft → approved, přesun do schválené knihovny). */
  async approve(id: string, user: CurrentUser): Promise<Potion> {
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

  /** Smaže lektvar. Autor jen svůj NÁVRH (draft); kurátor cokoli. */
  async remove(id: string, user: CurrentUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const isAuthorDraft =
      existing.authorId === user.id && existing.status === 'draft';
    if (!isAuthorDraft && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'POTION_NOT_AUTHOR',
        message: 'Smazat lektvar může jen autor (návrh) nebo správce.',
      });
    }
    // D-071 — hard-delete s obrázkem: blob by osiřel na Cloudinary → emit
    // `media.orphaned` (stejný úklid jako bestiae/plants/spells).
    if (existing.imageUrl)
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    await this.repo.delete(id);
  }

  /** Moderační skrytí/odkrytí — volá PotionsModerationEnforcementListener. */
  async moderationSetHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.setModeration(id, hidden, reason);
    return updated !== null;
  }

  /** Moderační smazání (M4). Lektvary nemají soft-delete → hard delete. */
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

  /** Kurátor lektvarů = správci diskusí/článků + Admin/Superadmin (reuse bestiae). */
  private isCurator(user: CurrentUser): boolean {
    return isBestieCurator(user.role);
  }

  private requireCurator(user: CurrentUser): void {
    if (!this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'POTION_NOT_CURATOR',
        message:
          'Na tohle potřebuješ být správce diskusí, článků nebo platformy.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'POTION_NOT_FOUND',
      message: 'Lektvar nenalezen.',
    });
  }
}
