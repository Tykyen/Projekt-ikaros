import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { Page } from './interfaces/page.interface';
import type { CreatePageDto } from './dto/create-page.dto';
import type { UpdatePageDto } from './dto/update-page.dto';

@Injectable()
export class PagesService {
  constructor(
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
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
    return this.pagesRepo.save({
      ...(dto as unknown as Partial<Page>),
      slug,
      worldId,
      content: dto.content ?? '',
      sections: (dto.sections as unknown as Page['sections']) ?? [],
      galleryImages: (dto.galleryImages as unknown as Page['galleryImages']) ?? [],
      videos: (dto.videos as unknown as Page['videos']) ?? [],
      accessRequirements: (dto.accessRequirements as unknown as Page['accessRequirements']) ?? [],
      order: dto.order ?? 0,
    });
  }

  async update(slug: string, worldId: string, dto: UpdatePageDto): Promise<Page> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    const updated = await this.pagesRepo.update(page.id, dto as unknown as Partial<Page>);
    return updated!;
  }

  async delete(slug: string, worldId: string): Promise<void> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    await this.pagesRepo.delete(page.id);
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
