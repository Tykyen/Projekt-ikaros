/**
 * 21.5e — Items service (předměty, komunitní katalog). Mirror spells.service
 * (21.5c): dvě knihovny + per-statblok schvalování (balancnuté), kurátoři =
 * isBestieCurator. `systemStats` schema-less — šablony vynucuje FE (spec R6).
 * Navíc jádro: druh (`kind` — řídí variantu polí ve FE), `suggestedPrice`.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemsRepository } from './repositories/items.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import { UserRole } from '../users/interfaces/user.interface';
import type { CurrentUser, Item } from './interfaces/item.interface';
import type { CreateCommunityItemDto } from './dto/create-community-item.dto';
import type { UpdateItemLoreDto } from './dto/update-item-lore.dto';
import type { ProposeItemStatblockDto } from './dto/propose-item-statblock.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly repo: ItemsRepository,
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
  ): Promise<Item[]> {
    return this.repo.findMany({
      ...filter,
      includeHidden: this.isGlobalAdmin(user),
    });
  }

  /** Detail (skrytý vidí jen Admin+ — ostatním 404, neprozradit existenci). */
  async findById(id: string, user: CurrentUser): Promise<Item> {
    const item = await this.repo.findById(id);
    if (!item) throw this.notFound();
    if (item.moderationHidden && !this.isGlobalAdmin(user))
      throw this.notFound();
    return item;
  }

  /** Založí předmět jako NÁVRH (draft) + první statblok (draft). */
  async create(dto: CreateCommunityItemDto, user: CurrentUser): Promise<Item> {
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

  /** Úprava jádra (název/druh/oznámení/obrázek/cena). STATY tudy NEjdou. */
  async updateLore(
    id: string,
    dto: UpdateItemLoreDto,
    user: CurrentUser,
  ): Promise<Item> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (existing.authorId !== user.id && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'ITEM_NOT_AUTHOR',
        message: 'Upravit předmět může jen autor nebo správce.',
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
    dto: ProposeItemStatblockDto,
    user: CurrentUser,
  ): Promise<Item> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const sb = existing.statblocks?.[dto.systemId];
    if (sb && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'ITEM_STATBLOCK_EXISTS',
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
  ): Promise<Item> {
    this.requireCurator(user);
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (!existing.statblocks?.[systemId]) {
      throw new BadRequestException({
        code: 'ITEM_STATBLOCK_MISSING',
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

  /** Kurátor schválí předmět (draft → approved, přesun do schválené knihovny). */
  async approve(id: string, user: CurrentUser): Promise<Item> {
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

  /** Smaže předmět. Autor jen svůj NÁVRH (draft); kurátor cokoli. */
  async remove(id: string, user: CurrentUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const isAuthorDraft =
      existing.authorId === user.id && existing.status === 'draft';
    if (!isAuthorDraft && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'ITEM_NOT_AUTHOR',
        message: 'Smazat předmět může jen autor (návrh) nebo správce.',
      });
    }
    // D-071 — hard-delete s obrázkem: blob by osiřel na Cloudinary → emit
    // `media.orphaned` (stejný úklid jako bestiae/plants/spells).
    if (existing.imageUrl)
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    await this.repo.delete(id);
  }

  /** Moderační skrytí/odkrytí — volá ItemsModerationEnforcementListener. */
  async moderationSetHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.setModeration(id, hidden, reason);
    return updated !== null;
  }

  /** Moderační smazání (M4). Předměty nemají soft-delete → hard delete. */
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

  /** Kurátor předmětů = správci diskusí/článků + Admin/Superadmin (reuse bestiae). */
  private isCurator(user: CurrentUser): boolean {
    return isBestieCurator(user.role);
  }

  private requireCurator(user: CurrentUser): void {
    if (!this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'ITEM_NOT_CURATOR',
        message:
          'Na tohle potřebuješ být správce diskusí, článků nebo platformy.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ITEM_NOT_FOUND',
      message: 'Předmět nenalezen.',
    });
  }
}
