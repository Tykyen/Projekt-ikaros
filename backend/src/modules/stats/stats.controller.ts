import {
  Controller,
  Get,
  Post,
  Body,
  Inject,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import { UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SearchCoordinator } from '../search/search.coordinator';
import type { ISearchStatsRepository } from '../search/interfaces/search-stats-repository.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';

@ApiTags('Stats')
@ApiBearerAuth()
@Controller('stats')
// 13.1c (D-NEW-search-index-monitoring) — celý stats hub jen pro platform Admin+
// (rebuild = drahá operace / DoS riziko, stats = interní metriky).
@UseGuards(JwtAuthGuard, AdminGuard)
export class StatsController {
  private readonly logger = new Logger(StatsController.name);

  constructor(
    @Inject('ISearchStatsRepository')
    private readonly statsRepo: ISearchStatsRepository,
    @Inject('SearchCoordinator')
    private readonly coordinator: SearchCoordinator,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Statistiky search indexu (Admin+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async getSearchStats() {
    return this.statsRepo.get();
  }

  @Post('search/rebuild')
  @HttpCode(202)
  @ApiOperation({ summary: 'Spustí rebuild search indexu (Admin+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  triggerRebuild() {
    void this.coordinator
      .rebuildIndex()
      .catch((err: unknown) =>
        logError(this.logger, 'rebuildIndex selhal', err),
      );
    return { message: 'Rebuild zahájen.' };
  }

  @Post('search/reindex')
  @HttpCode(202)
  @ApiOperation({ summary: 'Spustí reindex search indexu (Admin+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async triggerReindex(@Body() body: { slug?: string; pageId?: string }) {
    if (!body?.slug && !body?.pageId)
      return { message: 'Uveden slug nebo pageId.' };
    let page: Page | null = null;
    if (body.slug) {
      const pages = await this.pagesRepo.findAll();
      page = pages.find((p) => p.slug === body.slug) ?? null;
    }
    if (!page && body.pageId) {
      page = await this.pagesRepo.findById(body.pageId);
    }
    if (page) await this.coordinator.updatePageInIndex(page);
    return { message: 'Reindex zahájen.' };
  }
}
