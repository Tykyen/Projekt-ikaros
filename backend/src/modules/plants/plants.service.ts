/**
 * 21.5a — Plants service (herbář, komunitní katalog rostlin).
 *
 * Jen globální komunitní scope — žádné system/user/world, žádné boj/statblok/
 * spawn/klon. Kurátoři (správci diskusí/článků + Admin/Superadmin) schvalují a
 * moderují — reuse `isBestieCurator` z bestiae (`curator-roles.ts`), stejná
 * množina rolí. Vzor: bestiae.service (community část), silně zjednodušeno.
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlantsRepository } from './repositories/plants.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import { UserRole } from '../users/interfaces/user.interface';
import type {
  CurrentUser,
  Plant,
  PlantRarity,
} from './interfaces/plant.interface';
import type { CreatePlantDto } from './dto/create-plant.dto';
import type { UpdatePlantDto } from './dto/update-plant.dto';

@Injectable()
export class PlantsService {
  constructor(
    private readonly repo: PlantsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Veřejné čtení herbáře (dvě knihovny přes `status`, filtr rarity/tag).
   * Moderačně skryté rostliny vidí v listu jen Admin+ (`includeHidden`).
   */
  async list(
    filter: {
      status?: 'draft' | 'approved';
      rarity?: PlantRarity;
      tag?: string;
    },
    user: CurrentUser,
  ): Promise<Plant[]> {
    return this.repo.findMany({
      ...filter,
      includeHidden: this.isGlobalAdmin(user),
    });
  }

  /** Detail rostliny (veřejné čtení; skrytou vidí jen Admin+). */
  async findById(id: string, user: CurrentUser): Promise<Plant> {
    const plant = await this.repo.findById(id);
    if (!plant) throw this.notFound();
    // Moderačně skrytá rostlina: vidí ji jen platform reviewer (Admin+); ostatním
    // 404, aby se neprozradila existence (parity s bestiae B5).
    if (plant.moderationHidden && !this.isGlobalAdmin(user))
      throw this.notFound();
    return plant;
  }

  /** Založí rostlinu jako NÁVRH (draft). Autor = přihlášený uživatel. */
  async create(dto: CreatePlantDto, user: CurrentUser): Promise<Plant> {
    return this.repo.create({
      scope: 'community',
      name: dto.name,
      aliases: dto.aliases,
      imageUrl: dto.imageUrl,
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
      imageFocalX: dto.imageFocalX,
      imageFocalY: dto.imageFocalY,
      imageZoom: dto.imageZoom,
      imageFit: dto.imageFit,
      habitat: dto.habitat,
      usage: dto.usage,
      rarity: dto.rarity,
      rarityNote: dto.rarityNote,
      description: dto.description ?? '',
      tags: dto.tags,
      suggestedPrice: dto.suggestedPrice ?? null,
      status: 'draft',
      authorId: user.id,
      statblocks: {},
    });
  }

  /**
   * Úprava rostliny — mění VŠECHNA pole (herbář nemá lore/statblok split).
   * Smí autor nebo kurátor. `statblocks` se přes update NEmění.
   */
  async update(
    id: string,
    dto: UpdatePlantDto,
    user: CurrentUser,
  ): Promise<Plant> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (existing.authorId !== user.id && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'PLANT_NOT_AUTHOR',
        message: 'Upravit rostlinu může jen autor nebo správce.',
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
    // D-072 — `rarity: null` = sentinel „vymazat na neurčeno". Enum v schématu
    // null nezná → přeložíme na `$unset` (mongoose by null zamítl / $set nechal).
    const { rarity, ...rest } = dto;
    const patch: Partial<Plant> = { ...rest };
    const unset: string[] = [];
    if (rarity === null) unset.push('rarity');
    else if (rarity !== undefined) patch.rarity = rarity;
    // `dto` nese jen odeslaná pole (class-validator); mongoose strip undefined v
    // `$set` → partial update. `statblocks`/`status`/`authorId` DTO neobsahuje.
    const updated = await this.repo.update(id, patch, unset);
    if (!updated) throw this.notFound();
    return updated;
  }

  /** Kurátor schválí rostlinu (draft → approved). */
  async approve(id: string, user: CurrentUser): Promise<Plant> {
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

  /** Smaže rostlinu. Autor jen svůj NÁVRH (draft); kurátor cokoli. */
  async remove(id: string, user: CurrentUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const isAuthorDraft =
      existing.authorId === user.id && existing.status === 'draft';
    if (!isAuthorDraft && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'PLANT_NOT_AUTHOR',
        message: 'Smazat rostlinu může jen autor (návrh) nebo správce.',
      });
    }
    // D-071 — hard-delete s obrázkem: blob by osiřel na Cloudinary → emit
    // `media.orphaned` (stejný úklid jako bestiae).
    if (existing.imageUrl)
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    await this.repo.delete(id);
  }

  /**
   * Moderační skrytí/odkrytí (parity s bestiae). Bez autorské/role brány
   * (autorizuje moderační cesta) — volá `PlantsModerationEnforcementListener`.
   */
  async moderationSetHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.setModeration(id, hidden, reason);
    return updated !== null;
  }

  /**
   * D-070 — moderační smazání (M4). Rostliny nemají soft-delete → hard delete
   * (revert M4 je NEVRATNÝ, listener to loguje). Blob úklid jako u `remove`.
   */
  async moderationRemove(id: string): Promise<boolean> {
    const existing = await this.repo.findById(id);
    if (!existing) return false;
    if (existing.imageUrl)
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    await this.repo.delete(id);
    return true;
  }

  // ───────── Authorization helpers ─────────

  // elevation-exempt: herbář je čistě globální/platformový katalog (žádný world
  // scope), tohle je platform-admin gate — ne world bypass přes worldAdminBypass.
  private isGlobalAdmin(user: CurrentUser): boolean {
    return user.role === UserRole.Superadmin || user.role === UserRole.Admin;
  }

  /**
   * Kurátor herbáře = správci diskusí/článků + Admin/Superadmin. REUSE čisté
   * funkce z bestiae (`curator-roles.ts`) — stejná množina rolí, jeden zdroj.
   */
  private isCurator(user: CurrentUser): boolean {
    return isBestieCurator(user.role);
  }

  private requireCurator(user: CurrentUser): void {
    if (!this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'PLANT_NOT_CURATOR',
        message:
          'Na tohle potřebuješ být správce diskusí, článků nebo platformy.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PLANT_NOT_FOUND',
      message: 'Rostlina nenalezena.',
    });
  }
}
