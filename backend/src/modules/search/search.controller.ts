import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Inject,
  HttpCode,
  UseGuards,
  BadRequestException,
  forwardRef,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { SearchCoordinator } from './search.coordinator';
import { WorldsService } from '../worlds/worlds.service';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';
import type { SearchResult } from './interfaces/search-result.interface';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(
    private readonly coordinator: SearchCoordinator,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject(forwardRef(() => WorldsService))
    private readonly worldsService: WorldsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Full-text + embedding vyhledávání stránek ve světě',
  })
  @ApiResponse({ status: 200 })
  async search(
    @CurrentUser() user: RequestUser | undefined,
    @Query('q') query: string,
    @Query('count') count = 5,
    @Query('provider') provider?: string,
    @Query('worldId') worldId?: string,
  ): Promise<SearchResult[]> {
    if (!query?.trim()) return [];

    // 13.1 (D-NEW-global-search-access-leak) — `worldId` je povinný. Globální
    // search napříč platformou by vracel celý index bez access kontroly = leak
    // názvů stránek z privátních světů. Bez worldId proto odmítneme.
    if (!worldId?.trim()) {
      throw new BadRequestException({
        code: 'WORLD_ID_REQUIRED',
        message: 'Vyhledávání vyžaduje worldId (hledá se v rámci světa).',
      });
    }

    // Access check — requester musí mít přístup ke světu. `findByIdForRequester`
    // hodí 404 u privátního světa bez membershipu (auth-leak-policy: 404, ne 403).
    // Brání hledání v cizím privátním světě posláním jeho worldId.
    await this.worldsService.findByIdForRequester(worldId, user ?? null);

    const results = await this.coordinator.search(
      query,
      Number(count),
      provider,
    );

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
  @UseGuards(AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Přidání stránky do search indexu (Admin+)' })
  @ApiResponse({ status: 200 })
  async pageCreated(@Body() page: Page) {
    await this.coordinator.addPageToIndex(page);
    return { message: 'Page added to index.' };
  }

  @Post('updated')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Aktualizace stránky v search indexu (Admin+)' })
  @ApiResponse({ status: 200 })
  async pageUpdated(@Body() page: Page) {
    await this.coordinator.updatePageInIndex(page);
    return { message: 'Page updated in index.' };
  }

  @Post('deleted')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Odebrání stránky ze search indexu (Admin+)' })
  @ApiResponse({ status: 200 })
  async pageDeleted(@Body() slug: string) {
    await this.coordinator.deletePageFromIndex(slug);
    return { message: 'Page removed from index.' };
  }

  @Post('reindex')
  @UseGuards(AdminGuard)
  @HttpCode(202)
  @ApiOperation({ summary: 'Inkrementální reindex stránek (Admin+)' })
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
  @UseGuards(AdminGuard)
  @HttpCode(202)
  @ApiOperation({ summary: 'Úplné přebudování search indexu (Admin+)' })
  @ApiResponse({ status: 202 })
  rebuild() {
    void this.coordinator.rebuildIndex();
    return { message: 'Rebuild zahájen.' };
  }
}
