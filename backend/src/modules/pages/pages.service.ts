import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { Page } from './interfaces/page.interface';
import type { CreatePageDto } from './dto/create-page.dto';
import type { UpdatePageDto } from './dto/update-page.dto';
import { TipTapExtractor } from './tiptap-extractor.service';

@Injectable()
export class PagesService {
  constructor(
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    private readonly tipTapExtractor: TipTapExtractor,
  ) {}

  async findByWorld(worldId: string, type?: string): Promise<Page[]> {
    return this.pagesRepo.findByWorld(worldId, type);
  }

  async findBySlug(slug: string, worldId: string, userId: string): Promise<Page> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    await this.assertAccess(page, userId, worldId);
    return page;
  }

  async create(dto: CreatePageDto, worldId: string): Promise<Page> {
    const slug = dto.slug.toLowerCase();
    const exists = await this.pagesRepo.existsBySlugAndWorld(slug, worldId);
    if (exists) throw new ConflictException('Slug již existuje v tomto světě');
    const plainText = this.tipTapExtractor.extract(dto.content ?? '');
    return this.pagesRepo.save({
      ...dto,
      slug,
      worldId,
      content: dto.content ?? '',
      plainText,
      sections: (dto.sections ?? []) as any,
      galleryImages: (dto.galleryImages ?? []) as any,
      videos: (dto.videos ?? []) as any,
      menu: (dto.menu ?? []) as any,
      isWoodWide: dto.isWoodWide ?? false,
      accessRequirements: (dto.accessRequirements ?? []) as any,
      order: dto.order ?? 0,
    } as Partial<Page>);
  }

  async update(id: string, worldId: string, dto: UpdatePageDto): Promise<Page> {
    const page = await this.pagesRepo.findById(id);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    if (page.worldId !== worldId) throw new ForbiddenException('Stránka nepatří do tohoto světa');
    const extra: Partial<Page> = {};
    if (dto.content !== undefined) {
      extra.plainText = this.tipTapExtractor.extract(dto.content);
    }
    const updated = await this.pagesRepo.update(id, { ...dto, ...extra } as any);
    return updated!;
  }

  async delete(id: string, worldId: string): Promise<void> {
    const page = await this.pagesRepo.findById(id);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    if (page.worldId !== worldId) throw new ForbiddenException('Stránka nepatří do tohoto světa');
    await this.pagesRepo.delete(id);
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

  async findMeta(slug: string, worldId: string): Promise<{ isWoodWide: boolean }> {
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

  private async assertAccess(page: Page, userId: string, worldId: string): Promise<void> {
    if (!page.accessRequirements || page.accessRequirements.length === 0) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    for (const req of page.accessRequirements) {
      if (req.type === 'UserId' && req.value === userId) return;
      if (req.type === 'AKJ' && membership && membership.akj >= parseInt(req.value, 10)) return;
      if (req.type === 'Role' && membership && membership.role >= parseInt(req.value, 10)) return;
    }
    throw new ForbiddenException('Přístup odepřen');
  }
}
