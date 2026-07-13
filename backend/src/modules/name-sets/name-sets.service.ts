/**
 * 21.2a — NameSets service (jmenné sady pro Generátory).
 *
 * Jen globální komunitní scope; kurátoři schvalují (reuse `isBestieCurator`).
 * Bez obrázků → žádný media cleanup. Specifikum: dedup + trim jmenných
 * seznamů při každém zápisu (FE posílá surové řádky z textarey).
 * Vzor: plants.service.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NameSetsRepository } from './repositories/name-sets.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import { UserRole } from '../users/interfaces/user.interface';
import type {
  CurrentUser,
  NameSet,
  NameSetCategory,
  NameSetSummary,
} from './interfaces/name-set.interface';
import type { CreateNameSetDto } from './dto/create-name-set.dto';
import type { UpdateNameSetDto } from './dto/update-name-set.dto';

@Injectable()
export class NameSetsService {
  constructor(private readonly repo: NameSetsRepository) {}

  /**
   * List vrací SOUHRN bez jmenných polí (sada má tisíce jmen — 76 sad by
   * bylo ~2 MB). Plné seznamy dává až detail (`findById`).
   */
  async list(
    filter: {
      status?: 'draft' | 'approved';
      category?: NameSetCategory;
      tag?: string;
    },
    user: CurrentUser,
  ): Promise<NameSetSummary[]> {
    const sets = await this.repo.findMany({
      ...filter,
      includeHidden: this.isGlobalAdmin(user),
    });
    return sets.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      surnameNote: s.surnameNote,
      tags: s.tags,
      femaleSurnameRule: s.femaleSurnameRule,
      frequencySorted: s.frequencySorted,
      demography: s.demography,
      status: s.status,
      authorId: s.authorId,
      counts: {
        male: s.maleNames.length,
        female: s.femaleNames.length,
        surnames: s.surnames.length,
        epithets: s.epithets.length,
      },
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /** Detail sady (skrytou vidí jen Admin+ — jinak 404, neprozrazovat existenci). */
  async findById(id: string, user: CurrentUser): Promise<NameSet> {
    const set = await this.repo.findById(id);
    if (!set) throw this.notFound();
    if (set.moderationHidden && !this.isGlobalAdmin(user))
      throw this.notFound();
    return set;
  }

  /** Založí sadu jako NÁVRH (draft). Autor = přihlášený uživatel. */
  async create(dto: CreateNameSetDto, user: CurrentUser): Promise<NameSet> {
    this.validateDemography(dto);
    return this.repo.create({
      scope: 'community',
      name: dto.name,
      category: dto.category,
      description: dto.description,
      surnameNote: dto.surnameNote,
      tags: dto.tags,
      maleNames: this.normalizeList(dto.maleNames),
      femaleNames: this.normalizeList(dto.femaleNames),
      surnames: this.normalizeList(dto.surnames),
      epithets: this.normalizeList(dto.epithets),
      femaleSurnameRule: dto.femaleSurnameRule ?? 'none',
      frequencySorted: dto.frequencySorted ?? false,
      demography: dto.demography,
      status: 'draft',
      authorId: user.id,
    });
  }

  /** Úprava sady — mění všechna pole. Smí autor nebo kurátor. */
  async update(
    id: string,
    dto: UpdateNameSetDto,
    user: CurrentUser,
  ): Promise<NameSet> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    if (existing.authorId !== user.id && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'NAMESET_NOT_AUTHOR',
        message: 'Upravit sadu může jen autor nebo správce.',
      });
    }
    this.validateDemography(dto);
    const patch: Partial<NameSet> = { ...dto };
    for (const key of [
      'maleNames',
      'femaleNames',
      'surnames',
      'epithets',
    ] as const) {
      if (dto[key] !== undefined) patch[key] = this.normalizeList(dto[key]);
    }
    const updated = await this.repo.update(id, patch);
    if (!updated) throw this.notFound();
    return updated;
  }

  /** Kurátor schválí sadu (draft → approved). */
  async approve(id: string, user: CurrentUser): Promise<NameSet> {
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

  /** Smaže sadu. Autor jen svůj NÁVRH (draft); kurátor cokoli. */
  async remove(id: string, user: CurrentUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw this.notFound();
    const isAuthorDraft =
      existing.authorId === user.id && existing.status === 'draft';
    if (!isAuthorDraft && !this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'NAMESET_NOT_AUTHOR',
        message: 'Smazat sadu může jen autor (návrh) nebo správce.',
      });
    }
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

  /** Moderační smazání (M4) — hard delete (sady nemají soft-delete). */
  async moderationRemove(id: string): Promise<boolean> {
    const existing = await this.repo.findById(id);
    if (!existing) return false;
    await this.repo.delete(id);
    return true;
  }

  // ───────── Helpers ─────────

  /** Trim + vyhození prázdných + dedup (case-sensitive — „Ada"≠„ADA" řeší data). */
  private normalizeList(list?: string[]): string[] {
    if (!list) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const v = raw.trim().replace(/\s+/g, ' ');
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  private validateDemography(dto: {
    demography?: { fertilityFrom?: number; fertilityTo?: number };
  }): void {
    const d = dto.demography;
    if (
      d?.fertilityFrom !== undefined &&
      d?.fertilityTo !== undefined &&
      d.fertilityFrom > d.fertilityTo
    ) {
      throw new BadRequestException({
        code: 'NAMESET_BAD_DEMOGRAPHY',
        message: 'Začátek plodnosti nemůže být větší než její konec.',
      });
    }
  }

  // ───────── Authorization helpers ─────────

  private isGlobalAdmin(user: CurrentUser): boolean {
    // elevation-exempt: jmenné sady jsou čistě globální/platformový katalog
    // (žádný world scope) — platform-admin gate, ne bypass worldAdminBypass.
    return user.role === UserRole.Superadmin || user.role === UserRole.Admin;
  }

  private isCurator(user: CurrentUser): boolean {
    return isBestieCurator(user.role);
  }

  private requireCurator(user: CurrentUser): void {
    if (!this.isCurator(user)) {
      throw new ForbiddenException({
        code: 'NAMESET_NOT_CURATOR',
        message:
          'Na tohle potřebuješ být správce diskusí, článků nebo platformy.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'NAMESET_NOT_FOUND',
      message: 'Jmenná sada nenalezena.',
    });
  }
}
