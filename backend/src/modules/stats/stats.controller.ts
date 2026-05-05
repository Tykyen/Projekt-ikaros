import { Controller, Get, Post, Body, Inject, HttpCode } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SearchCoordinator } from '../search/search.coordinator';
import type { ISearchStatsRepository } from '../search/interfaces/search-stats-repository.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';

@Controller('api/stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(
    @Inject('ISearchStatsRepository') private readonly statsRepo: ISearchStatsRepository,
    @Inject('SearchCoordinator') private readonly coordinator: SearchCoordinator,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
  ) {}

  @Get('search')
  async getSearchStats() {
    return this.statsRepo.get();
  }

  @Post('search/rebuild')
  @HttpCode(202)
  triggerRebuild() {
    void this.coordinator.rebuildIndex();
    return { message: 'Rebuild zahájen.' };
  }

  @Post('search/reindex')
  @HttpCode(202)
  async triggerReindex(@Body() body: { slug?: string; pageId?: string }) {
    if (!body?.slug && !body?.pageId) return { message: 'Uveden slug nebo pageId.' };
    let page: Page | null = null;
    if (body.slug) {
      const pages = await this.pagesRepo.findAll();
      page = pages.find((p) => p.slug === body.slug) ?? null;
    }
    if (!page && body.pageId) {
      page = await (this.pagesRepo as any).findById(body.pageId);
    }
    if (page) await this.coordinator.updatePageInIndex(page);
    return { message: 'Reindex zahájen.' };
  }
}
