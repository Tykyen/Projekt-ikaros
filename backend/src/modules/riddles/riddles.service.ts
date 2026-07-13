/**
 * 21.5d — Riddles service (hádanky, komunitní katalog). Vzor: plants.service
 * (community-only, bez statblocků, plná editace jádra jedním PATCH — spec R5).
 * Kurátoři = isBestieCurator (stejná množina jako ostatní knihovny).
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RiddlesRepository } from './repositories/riddles.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import { UserRole } from '../users/interfaces/user.interface';
import type {
  CurrentUser,
  Riddle,
  RiddleDifficulty,
} from './interfaces/riddle.interface';
import type { CreateRiddleDto } from './dto/create-riddle.dto';
import type { UpdateRiddleDto } from './dto/update-riddle.dto';

@Injectable()
export class RiddlesService {
  constructor(
    private readonly repo: RiddlesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Čtení katalogu (dvě knihovny, filtr úroveň/tag); skryté jen Admin+. */
  async list(
    filter: {
      status?: 'draft' | 'approved';
      difficulty?: RiddleDifficulty;
      tag?: string;
    },
    user: CurrentUser,
  ): Promise<Riddle[]> {
    return this.repo.findMany({
      ...filter,
      includeHidden: this.isGlobalAdmin(user),
    });
  }

  /** Detail (skrytou vidí jen Admin+ — ostatním 404, neprozradit existenci). */
  async findById(id: string, user: CurrentUser): Promise<Riddle> {
    const riddle = await this.repo.findById(id);
    if (!riddle) throw this.notFound();
    if (riddle.moderationHidden && !this.isGlobalAdmin(user))
      throw this.notFound();
    return riddle;
  }

  /** Založí hádanku jako NÁVRH (draft). Autor = přihlášený uživatel. */
  async create(dto: CreateRiddleDto, user: CurrentUser): Promise<Riddle> {
    return this.repo.create({
      scope: 'community',
      question: dto.question,
      answer: dto.answer,
      hints: dto.hints ?? [],
      difficulty: dto.difficulty,
      origin: dto.origin,
      description: dto.description,
      tags: dto.tags,
      imageUrl: dto.imageUrl,
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
      imageFocalX: dto.imageFocalX,
      imageFocalY: dto.imageFocalY,
      imageZoom: dto.imageZoom,
      imageFit: dto.imageFit,
      status: 'draft',
      authorId: user.id,
    });
  }

  /** Úprava hádanky — mění všechna pole (spec R5). Smí autor nebo kurátor. */
  async update(
    id: string,
    dto: UpdateRiddleDto,
    user: CurrentUser,
  ): Promise<Riddle> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (existing.authorId !== user.id && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'RIDDLE_NOT_AUTHOR',
        message: 'Upravit hádanku může jen autor nebo správce.',
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
    // partial update. `status`/`authorId` DTO neobsahuje.
    const updated = await this.repo.update(id, { ...dto });
    if (!updated) throw this.notFound();
    return updated;
  }

  /** Kurátor schválí hádanku (draft → approved). */
  async approve(id: string, user: CurrentUser): Promise<Riddle> {
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

  /** Smaže hádanku. Autor jen svůj NÁVRH (draft); kurátor cokoli. */
  async remove(id: string, user: CurrentUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const isAuthorDraft =
      existing.authorId === user.id && existing.status === 'draft';
    if (!isAuthorDraft && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'RIDDLE_NOT_AUTHOR',
        message: 'Smazat hádanku může jen autor (návrh) nebo správce.',
      });
    }
    // D-071 — hard-delete s obrázkem: blob by osiřel na Cloudinary → emit
    // `media.orphaned` (stejný úklid jako ostatní knihovny).
    if (existing.imageUrl)
      this.eventEmitter.emit('media.orphaned', { urls: [existing.imageUrl] });
    await this.repo.delete(id);
  }

  /** Moderační skrytí/odkrytí — volá RiddlesModerationEnforcementListener. */
  async moderationSetHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.setModeration(id, hidden, reason);
    return updated !== null;
  }

  /** Moderační smazání (M4). Hádanky nemají soft-delete → hard delete. */
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

  /** Kurátor hádanek = správci diskusí/článků + Admin/Superadmin (reuse bestiae). */
  private isCurator(user: CurrentUser): boolean {
    return isBestieCurator(user.role);
  }

  private requireCurator(user: CurrentUser): void {
    if (!this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'RIDDLE_NOT_CURATOR',
        message:
          'Na tohle potřebuješ být správce diskusí, článků nebo platformy.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'RIDDLE_NOT_FOUND',
      message: 'Hádanka nenalezena.',
    });
  }
}
