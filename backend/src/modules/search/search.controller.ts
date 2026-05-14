import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Inject,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SearchCoordinator } from './search.coordinator';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';
import type { SearchResult } from './interfaces/search-result.interface';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('api/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(
    private readonly coordinator: SearchCoordinator,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Full-text + embedding vyhledávání stránek' })
  @ApiResponse({ status: 200 })
  async search(
    @Query('q') query: string,
    @Query('count') count = 5,
    @Query('provider') provider?: string,
    @Query('worldId') worldId?: string,
  ): Promise<SearchResult[]> {
    if (!query?.trim()) return [];
    const results = await this.coordinator.search(
      query,
      Number(count),
      provider,
    );
    if (!worldId) return results;

    const worldPages = await this.pagesRepo.findByWorld(worldId);
    const validSlugs = new Set(worldPages.map((p) => p.slug));
    return results.filter((r) => validSlugs.has(r.slug));
  }

  @Get('providers')
  @ApiOperation({
    summary: 'Dostupní search provideři (MeiliSearch, ONNX) a jejich stav',
  })
  @ApiResponse({ status: 200 })
  getProviders() {
    return this.coordinator.getProviders();
  }

  @Post('created')
  @HttpCode(200)
  @ApiOperation({ summary: 'Přidání stránky do search indexu' })
  @ApiResponse({ status: 200 })
  async pageCreated(@Body() page: Page) {
    await this.coordinator.addPageToIndex(page);
    return { message: 'Page added to index.' };
  }

  @Post('updated')
  @HttpCode(200)
  @ApiOperation({ summary: 'Aktualizace stránky v search indexu' })
  @ApiResponse({ status: 200 })
  async pageUpdated(@Body() page: Page) {
    await this.coordinator.updatePageInIndex(page);
    return { message: 'Page updated in index.' };
  }

  @Post('deleted')
  @HttpCode(200)
  @ApiOperation({ summary: 'Odebrání stránky ze search indexu' })
  @ApiResponse({ status: 200 })
  async pageDeleted(@Body() slug: string) {
    await this.coordinator.deletePageFromIndex(slug);
    return { message: 'Page removed from index.' };
  }

  @Post('reindex')
  @HttpCode(202)
  @ApiOperation({ summary: 'Inkrementální reindex stránek' })
  @ApiResponse({ status: 202 })
  async reindex(@Body() body: { slug?: string; pageId?: string }) {
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

  @Post('rebuild')
  @HttpCode(202)
  @ApiOperation({ summary: 'Úplné přebudování search indexu' })
  @ApiResponse({ status: 202 })
  rebuild() {
    void this.coordinator.rebuildIndex();
    return { message: 'Rebuild zahájen.' };
  }
}
