import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PagesService } from './pages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  role: UserRole;
  /** World elevation (platform Admin bypass jen pro tyto světy) — viz worldAdminBypass. */
  elevatedWorldIds?: string[];
}

@ApiTags('Pages')
@ApiBearerAuth()
@Controller('worlds/:worldId/pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Seznam stránek světa (s access filtrem)' })
  @ApiResponse({ status: 200, description: 'OK' })
  findAll(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
    @Query('type') type?: string,
  ) {
    return this.pagesService.findByWorld(
      worldId,
      type,
      user.id,
      user.role,
      user.elevatedWorldIds,
    );
  }

  @Get('directory')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Adresářový přehled stránek (?type=A,B filtruje na konkrétní typy)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  getDirectory(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
    @Query('type') type?: string,
  ) {
    // ?type=PostavaHrace,NPC → CSV split; ?type=PostavaHrace → single item
    const types = type
      ? type
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    return this.pagesService.findDirectory(
      worldId,
      types,
      user.id,
      user.role,
      user.elevatedWorldIds,
    );
  }

  @Get('dataSlugs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Všechny slugy stránek světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  getDataSlugs(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.findAllSlugs(worldId, user);
  }

  @Get('data')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Stránky dle počtu ?number=N' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  getData(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
    @Query('number') number?: string,
  ) {
    // FIX-67 — nečíselné `number` → parseInt vrátí NaN → `$sample: {size: NaN}`
    // → Mongo 500. Guard s fallbackem na default (5).
    const parsed = number !== undefined ? parseInt(number, 10) : NaN;
    const count = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
    return this.pagesService.findRandom(
      worldId,
      count,
      user.id,
      user.role,
      user.elevatedWorldIds,
    );
  }

  @Get('meta/:slug')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Metadata stránky dle slugu' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Stránka nenalezena' })
  getMeta(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.findMeta(
      slug,
      worldId,
      user.id,
      user.role,
      user.elevatedWorldIds,
    );
  }

  @Get(':slug')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Plný obsah stránky dle slugu' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 404, description: 'Stránka nenalezena' })
  findOne(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.findBySlug(
      slug,
      worldId,
      user.id,
      user.role,
      user.elevatedWorldIds,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vytvoření stránky (PomocnyPJ+)' })
  @ApiResponse({ status: 201, description: 'Stránka vytvořena' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreatePageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.create(dto, worldId, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace stránky (PomocnyPJ+)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 404, description: 'Stránka nenalezena' })
  update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.update(id, worldId, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Smazání stránky (PomocnyPJ+)' })
  @ApiResponse({ status: 204, description: 'Smazáno' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 404, description: 'Stránka nenalezena' })
  remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.delete(id, worldId, user);
  }

  @Get(':slug/backlinks')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Seznam stránek odkazujících na zadanou stránku (7.1l)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 404, description: 'Stránka nenalezena' })
  getBacklinks(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.findBacklinks(
      slug,
      worldId,
      user.id,
      user.role,
      user.elevatedWorldIds,
    );
  }
}
