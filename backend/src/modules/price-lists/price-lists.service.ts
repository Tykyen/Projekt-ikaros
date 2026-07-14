/**
 * 21.5f — PriceLists service (ceníky, komunitní knihovna).
 *
 * Jen globální komunitní scope. Kurátoři (správci diskusí/článků + Admin/
 * Superadmin) schvalují a moderují — reuse `isBestieCurator` (curator-roles.ts),
 * stejná množina rolí jako celá rodina Společné tvorby. Vzor: plants.service.
 *
 * Specifikum ceníků: obrázky nese i KAŽDÁ položka (`items[].imageUrl`) —
 * úklid osiřelých blobů (D-071) proto diffuje množiny URL starého a nového
 * stavu (cover + všechny položky), ne jen jedno pole.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PriceListsRepository } from './repositories/price-lists.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import { UserRole } from '../users/interfaces/user.interface';
import {
  PRICE_LIST_MAX_ITEMS,
  type CurrentUser,
  type PriceList,
  type PriceListItem,
} from './interfaces/price-list.interface';
import type { CreatePriceListDto } from './dto/create-price-list.dto';
import type { UpdatePriceListDto } from './dto/update-price-list.dto';
import type { PriceListItemDto } from './dto/price-list-item.dto';

@Injectable()
export class PriceListsService {
  constructor(
    private readonly repo: PriceListsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Čtení knihovny ceníků (dvě knihovny přes `status`, filtr tag).
   * Moderačně skryté ceníky vidí v listu jen Admin+ (`includeHidden`).
   */
  async list(
    filter: { status?: 'draft' | 'approved'; tag?: string },
    user: CurrentUser,
  ): Promise<PriceList[]> {
    return this.repo.findMany({
      ...filter,
      includeHidden: this.isGlobalAdmin(user),
    });
  }

  /** Detail ceníku (skrytý vidí jen Admin+ — jinak 404, neprozrazovat existenci). */
  async findById(id: string, user: CurrentUser): Promise<PriceList> {
    const list = await this.repo.findById(id);
    if (!list) throw this.notFound();
    if (list.moderationHidden && !this.isGlobalAdmin(user))
      throw this.notFound();
    return list;
  }

  /** Založí ceník jako NÁVRH (draft). Autor = přihlášený uživatel. */
  async create(dto: CreatePriceListDto, user: CurrentUser): Promise<PriceList> {
    return this.repo.create({
      scope: 'community',
      name: dto.name,
      description: dto.description ?? '',
      imageUrl: dto.imageUrl,
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
      imageFocalX: dto.imageFocalX,
      imageFocalY: dto.imageFocalY,
      imageZoom: dto.imageZoom,
      imageFit: dto.imageFit,
      tags: dto.tags,
      currency: dto.currency ?? 'gsc', // 21.5g — měna zobrazení
      items: this.normalizeItems(dto.items ?? []),
      status: 'draft',
      authorId: user.id,
    });
  }

  /**
   * Úprava ceníku — mění všechna pole; `items` = plná náhrada pole (editor
   * posílá celé pole položek). Smí autor nebo kurátor. Osiřelé obrázky
   * (odstraněné/vyměněné — cover i položkové) ohlásí na `media.orphaned`.
   */
  async update(
    id: string,
    dto: UpdatePriceListDto,
    user: CurrentUser,
  ): Promise<PriceList> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (existing.authorId !== user.id && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'PRICELIST_NOT_AUTHOR',
        message: 'Upravit ceník může jen autor nebo správce.',
      });
    }

    const patch: Partial<PriceList> = { ...dto } as Partial<PriceList>;
    if (dto.items !== undefined) {
      if (dto.items.length > PRICE_LIST_MAX_ITEMS) {
        // Pojistka nad DTO validací (drží invariant i při budoucích cestách).
        throw new BadRequestException({
          code: 'PRICELIST_TOO_MANY_ITEMS',
          message: `Ceník může mít nejvýše ${PRICE_LIST_MAX_ITEMS} položek.`,
        });
      }
      patch.items = this.normalizeItems(dto.items);
    }

    // D-071 — diff množin obrázků (cover + položky): co zmizelo, ohlásit
    // k úklidu PŘED zápisem (best-effort; listener ne-Cloudinary URL ignoruje).
    const before = this.collectImageUrls(existing);
    const after = this.collectImageUrls({
      imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : existing.imageUrl,
      items: dto.items !== undefined ? patch.items! : existing.items,
    });
    const orphaned = [...before].filter((u) => !after.has(u));
    if (orphaned.length)
      this.eventEmitter.emit('media.orphaned', { urls: orphaned });

    const updated = await this.repo.update(id, patch);
    if (!updated) throw this.notFound();
    return updated;
  }

  /** Kurátor schválí ceník (draft → approved). */
  async approve(id: string, user: CurrentUser): Promise<PriceList> {
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

  /** Smaže ceník. Autor jen svůj NÁVRH (draft); kurátor cokoli. */
  async remove(id: string, user: CurrentUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const isAuthorDraft =
      existing.authorId === user.id && existing.status === 'draft';
    if (!isAuthorDraft && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'PRICELIST_NOT_AUTHOR',
        message: 'Smazat ceník může jen autor (návrh) nebo správce.',
      });
    }
    this.emitAllImagesOrphaned(existing);
    await this.repo.delete(id);
  }

  /** Moderační skrytí/odkrytí (autorizuje moderační cesta — listener). */
  async moderationSetHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.setModeration(id, hidden, reason);
    return updated !== null;
  }

  /** Moderační smazání (M4) — hard delete (ceníky nemají soft-delete). */
  async moderationRemove(id: string): Promise<boolean> {
    const existing = await this.repo.findById(id);
    if (!existing) return false;
    this.emitAllImagesOrphaned(existing);
    await this.repo.delete(id);
    return true;
  }

  // ───────── Helpers ─────────

  /** Doplní chybějící `id` položek (uuid) — pořadí = pořadí v poli. */
  private normalizeItems(items: PriceListItemDto[]): PriceListItem[] {
    return items.map((it) => ({
      id: it.id || randomUUID(),
      name: it.name,
      description: it.description,
      section: it.section,
      imageUrl: it.imageUrl,
      imageBytes: it.imageBytes,
      imageFocalX: it.imageFocalX ?? null,
      imageFocalY: it.imageFocalY ?? null,
      imageZoom: it.imageZoom ?? null,
      imageFit: it.imageFit ?? null,
      imageCredit: it.imageCredit,
      gold: it.gold,
      silver: it.silver,
      copper: it.copper,
      linkedItemId: it.linkedItemId,
    }));
  }

  /** Množina všech obrázkových URL ceníku (cover + položky). */
  private collectImageUrls(
    list: Pick<PriceList, 'imageUrl' | 'items'>,
  ): Set<string> {
    const urls = new Set<string>();
    if (list.imageUrl) urls.add(list.imageUrl);
    for (const it of list.items ?? []) if (it.imageUrl) urls.add(it.imageUrl);
    return urls;
  }

  /** D-071 — hard-delete: všechny bloby ceníku by osiřely → ohlásit úklid. */
  private emitAllImagesOrphaned(list: PriceList): void {
    const urls = [...this.collectImageUrls(list)];
    if (urls.length) this.eventEmitter.emit('media.orphaned', { urls });
  }

  // ───────── Authorization helpers ─────────

  private isGlobalAdmin(user: CurrentUser): boolean {
    // elevation-exempt: ceníky jsou čistě globální/platformový katalog (žádný
    // world scope) — platform-admin gate, ne world bypass přes worldAdminBypass.
    return user.role === UserRole.Superadmin || user.role === UserRole.Admin;
  }

  /** Kurátor ceníků = správci diskusí/článků + Admin/Superadmin (reuse bestiae). */
  private isCurator(user: CurrentUser): boolean {
    return isBestieCurator(user.role);
  }

  private requireCurator(user: CurrentUser): void {
    if (!this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'PRICELIST_NOT_CURATOR',
        message:
          'Na tohle potřebuješ být správce diskusí, článků nebo platformy.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PRICELIST_NOT_FOUND',
      message: 'Ceník nenalezen.',
    });
  }
}
