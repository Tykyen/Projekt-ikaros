import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SearchCoordinator } from '../search/search.coordinator';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IWorldSettingsRepository } from '../worlds/interfaces/world-settings-repository.interface';
import type { Page } from './interfaces/page.interface';
import type { CreatePageDto } from './dto/create-page.dto';
import type { UpdatePageDto } from './dto/update-page.dto';
import { TipTapExtractor } from './tiptap-extractor.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

export interface PagesRequester {
  id: string;
  role: UserRole;
}

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldSettingsRepository')
    private readonly settingsRepo: IWorldSettingsRepository,
    private readonly tipTapExtractor: TipTapExtractor,
    @Optional()
    @Inject(SearchCoordinator)
    private readonly searchCoordinator?: SearchCoordinator,
  ) {}

  async findByWorld(worldId: string, type?: string): Promise<Page[]> {
    return this.pagesRepo.findByWorld(worldId, type);
  }

  async findBySlug(
    slug: string,
    worldId: string,
    userId: string,
  ): Promise<Page> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    await this.assertAccess(page, userId, worldId);
    return page;
  }

  async create(
    dto: CreatePageDto,
    worldId: string,
    requester: PagesRequester,
  ): Promise<Page> {
    await this.assertCanWrite(worldId, requester);
    const slug = dto.slug.toLowerCase();
    const exists = await this.pagesRepo.existsBySlugAndWorld(slug, worldId);
    if (exists) throw new ConflictException('Slug již existuje v tomto světě');
    const plainText = this.tipTapExtractor.extract(dto.content ?? '');
    const savedPage = await this.pagesRepo.save({
      ...dto,
      slug,
      worldId,
      content: dto.content ?? '',
      plainText,
      sections: dto.sections ?? [],
      galleryImages: dto.galleryImages ?? [],
      videos: dto.videos ?? [],
      menu: (dto.menu ?? []).map((m) => ({ ...m, order: m.order ?? 0 })),
      isWoodWide: dto.isWoodWide ?? false,
      accessRequirements: dto.accessRequirements ?? [],
      order: dto.order ?? 0,
    });
    void this.searchCoordinator
      ?.addPageToIndex(savedPage)
      .catch((err: unknown) =>
        this.logger.warn(`addPageToIndex selhal pro ${savedPage.slug}`, err),
      );
    return savedPage;
  }

  async update(
    id: string,
    worldId: string,
    dto: UpdatePageDto,
    requester: PagesRequester,
  ): Promise<Page> {
    await this.assertCanWrite(worldId, requester);
    const page = await this.pagesRepo.findById(id);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    if (page.worldId !== worldId)
      throw new ForbiddenException('Stránka nepatří do tohoto světa');
    const extra: Partial<Page> = {};
    if (dto.content !== undefined) {
      extra.plainText = this.tipTapExtractor.extract(dto.content);
    }
    const updated = await this.pagesRepo.update(id, {
      ...dto,
      ...extra,
      menu: dto.menu?.map((m) => ({ ...m, order: m.order ?? 0 })),
    });
    void this.searchCoordinator
      ?.updatePageInIndex(updated!)
      .catch((err: unknown) =>
        this.logger.warn(`updatePageInIndex selhal pro id=${id}`, err),
      );
    return updated!;
  }

  async delete(
    id: string,
    worldId: string,
    requester: PagesRequester,
  ): Promise<void> {
    await this.assertCanWrite(worldId, requester);
    const page = await this.pagesRepo.findById(id);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    if (page.worldId !== worldId)
      throw new ForbiddenException('Stránka nepatří do tohoto světa');
    await this.pagesRepo.delete(id);
    void this.searchCoordinator
      ?.deletePageFromIndex(page.slug)
      .catch((err: unknown) =>
        this.logger.warn(`deletePageFromIndex selhal pro ${page.slug}`, err),
      );
  }

  async findDirectory(worldId: string) {
    return this.pagesRepo.findDirectory(worldId);
  }

  async findAllSlugs(worldId: string): Promise<string[]> {
    return this.pagesRepo.findAllSlugs(worldId);
  }

  async findRandom(worldId: string, count: number): Promise<Page[]> {
    return this.pagesRepo.findRandom(worldId, Math.max(1, Math.min(count, 50)));
  }

  async findMeta(
    slug: string,
    worldId: string,
  ): Promise<{ isWoodWide: boolean }> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    return { isWoodWide: page.isWoodWide ?? false };
  }

  async addFavorite(worldId: string, slug: string): Promise<void> {
    const exists = await this.pagesRepo.existsBySlugAndWorld(slug, worldId);
    if (!exists) throw new NotFoundException('Stránka nenalezena');
    await this.worldsRepo.addFavoriteSlug(worldId, slug);
  }

  async removeFavorite(worldId: string, slug: string): Promise<void> {
    await this.worldsRepo.removeFavoriteSlug(worldId, slug);
  }

  async findFavorites(worldId: string): Promise<Page[]> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    return this.pagesRepo.findBySlugs(world.favoritePageSlugs, worldId);
  }

  private async assertAccess(
    page: Page,
    userId: string,
    worldId: string,
  ): Promise<void> {
    if (!page.accessRequirements || page.accessRequirements.length === 0)
      return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    for (const req of page.accessRequirements) {
      if (req.type === 'UserId' && req.value === userId) return;
      if (
        req.type === 'AKJ' &&
        membership &&
        membership.akj >= parseInt(req.value, 10)
      )
        return;
      if (
        req.type === 'Role' &&
        membership &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        membership.role >= parseInt(req.value, 10)
      )
        return;
      if (req.type === 'AKJType') {
        const settings = await this.settingsRepo.findByWorldId(worldId);
        const akjTypes = settings?.akjTypes ?? [];
        const group = akjTypes.find((g) => g.key === req.value);
        if (group && membership && membership.akj >= group.level) return;
      }
    }
    throw new ForbiddenException('Přístup odepřen');
  }

  /**
   * Write access pro stránky: Admin/Superadmin shortcut, jinak WorldRole >= PomocnyPJ.
   * Neexistující svět = 404 (per .claude/rules/auth-leak-policy.md — auth-required pattern).
   * Vlastník světa není automaticky autorizován; rozhoduje membership.
   */
  private async assertCanWrite(
    worldId: string,
    requester: PagesRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
  }
}
