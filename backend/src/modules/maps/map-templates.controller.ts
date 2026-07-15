import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { MapsService } from './maps.service';
import { CreateMapTemplateDto } from './dto/create-map-template.dto';
import { PublishSceneTemplateDto } from './dto/publish-scene-template.dto';
import {
  SceneTemplateSharingService,
  type CatalogEntry,
} from './scene-template-sharing.service';
import type { IMapTemplatesRepository } from './interfaces/map-templates-repository.interface';
import type { MapTemplate } from './interfaces/map-template.interface';

interface RequestUser {
  id: string;
  role: UserRole;
}

/**
 * 10.2c-edit-2 — server-side filter PC tokenů ze save payloadu.
 *
 * PC tokeny (isNpc: false nebo undefined) nemají v šabloně co dělat —
 * při loadu do jiného světa by leakly characterId cizí postavy. FE filtr
 * je první obrana, BE filtr je defense in depth.
 */
function filterOutPcTokens(tokens: unknown[]): unknown[] {
  return tokens.filter(
    (t) =>
      typeof t === 'object' &&
      t !== null &&
      (t as Record<string, unknown>).isNpc === true,
  );
}

@ApiTags('Map Templates')
@ApiBearerAuth()
@Controller('map-templates')
export class MapTemplatesController {
  constructor(
    @Inject('IMapTemplatesRepository')
    private readonly repo: IMapTemplatesRepository,
    private readonly mapsService: MapsService,
    // 22.5 — publikace/katalog/kurátorský tok sdílení scén.
    private readonly sharing: SceneTemplateSharingService,
  ) {}

  // ── 22.5 — veřejný katalog (login-required). MUSÍ být PŘED `@Get(':id')`,
  //    jinak by `:id` zachytilo statické `catalog`. ──

  @ApiOperation({ summary: 'Veřejný katalog publikovaných šablon scén (22.5)' })
  @ApiResponse({ status: 200 })
  @Get('catalog')
  @UseGuards(JwtAuthGuard)
  async catalog(
    @Query('systemId') systemId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: CatalogEntry[]; total: number }> {
    return this.sharing.listCatalog({
      systemId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'Detail katalogové šablony (jen approved, 22.5)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @Get('catalog/:id')
  @UseGuards(JwtAuthGuard)
  async catalogDetail(@Param('id') id: string): Promise<CatalogEntry> {
    return this.sharing.getCatalogEntry(id);
  }

  @ApiOperation({
    summary: 'Šablony scén — per-PJ filter (Admin+ vidí všechny)',
  })
  @ApiResponse({ status: 200 })
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@CurrentUser() user: RequestUser): Promise<MapTemplate[]> {
    // World-elevation NEAPLIKOVÁNA: knihovna šablon je per-owner CROSS-WORLD
    // (ownerId, žádný worldId — viz project_takticka_mapa_library). Bez worldId
    // nelze `worldAdminBypass` použít; admin global bypass tu zůstává záměrně
    // (a vlastnické bypassy `role > Admin` níže taktéž — owner check, ne world).
    if (user.role <= UserRole.Admin) {
      return this.repo.findAll();
    }
    return this.repo.findByOwner(user.id);
  }

  @ApiOperation({ summary: 'Detail šablony (vlastní nebo Admin+ bypass)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'MAP_TEMPLATE_FORBIDDEN_OWNER' })
  @ApiResponse({ status: 404 })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<MapTemplate> {
    const tpl = await this.repo.findById(id);
    if (!tpl) {
      throw new NotFoundException({
        code: 'MAP_TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    // elevation-exempt: cross-world per-owner šablony (bez worldId)
    if (user.role > UserRole.Admin && tpl.ownerId !== user.id) {
      throw new ForbiddenException({
        code: 'MAP_TEMPLATE_FORBIDDEN_OWNER',
        message: 'Šablona patří jinému PJ',
      });
    }
    return tpl;
  }

  @ApiOperation({ summary: 'Vytvoření šablony (PJ+, vlastní ownerId)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403, description: 'MAP_TEMPLATE_FORBIDDEN' })
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateMapTemplateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MapTemplate> {
    // R-15 — mrtvý GLOBÁLNÍ práh `role > PJ(3)` odstraněn (po D-053 nikdo
    // globálního PJ nemá → zamykalo VŠECHNY world-PJ). Knihovna per-owner
    // privátní (ownerId server-enforced) → stačí přihlášení.
    return this.repo.create({
      ...dto,
      config: dto.config as unknown as MapTemplate['config'],
      ownerId: user.id, // server-side enforced
      tokens: filterOutPcTokens(dto.tokens ?? []) as MapTemplate['tokens'],
      npcTemplates: (dto.npcTemplates ?? []) as MapTemplate['npcTemplates'],
      effects: (dto.effects ?? []) as MapTemplate['effects'],
      revealedHexes: (dto.revealedHexes ?? []) as MapTemplate['revealedHexes'],
    });
  }

  @ApiOperation({ summary: 'Aktualizace šablony (vlastní nebo Admin+)' })
  @ApiResponse({ status: 204, description: 'Šablona aktualizována' })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async replace(
    @Param('id') id: string,
    @Body() dto: CreateMapTemplateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    // R-15 — mrtvý globální `role > PJ(3)` gate odstraněn; cross-owner přístup
    // chrání owner check níže.
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        code: 'MAP_TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    // elevation-exempt: cross-world per-owner šablony (bez worldId)
    if (user.role > UserRole.Admin && existing.ownerId !== user.id) {
      throw new ForbiddenException({
        code: 'MAP_TEMPLATE_FORBIDDEN_OWNER',
        message: 'Šablona patří jinému PJ',
      });
    }
    // 10.2c-edit-2 — `ownerId` immutable: ignorujeme cokoli v body, zachováme z existing
    await this.repo.replace(id, {
      ...dto,
      config: dto.config as unknown as MapTemplate['config'],
      ownerId: existing.ownerId,
      tokens: filterOutPcTokens(dto.tokens ?? []) as MapTemplate['tokens'],
      npcTemplates: (dto.npcTemplates ?? []) as MapTemplate['npcTemplates'],
      effects: (dto.effects ?? []) as MapTemplate['effects'],
      revealedHexes: (dto.revealedHexes ?? []) as MapTemplate['revealedHexes'],
    });
  }

  @ApiOperation({ summary: 'Smazání šablony (vlastní nebo Admin+)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    // R-15 — mrtvý globální `role > PJ(3)` gate odstraněn; cross-owner přístup
    // chrání owner check níže.
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        code: 'MAP_TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    // elevation-exempt: cross-world per-owner šablony (bez worldId)
    if (user.role > UserRole.Admin && existing.ownerId !== user.id) {
      throw new ForbiddenException({
        code: 'MAP_TEMPLATE_FORBIDDEN_OWNER',
        message: 'Šablona patří jinému PJ',
      });
    }
    await this.repo.delete(id);
  }

  // ── 22.5 — publikace / stažení / kurátorské schválení ──

  @ApiOperation({ summary: 'Publikovat šablonu do katalogu (owner, 22.5)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 400, description: 'TEMPLATE_INCOMPLETE' })
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async publish(
    @Param('id') id: string,
    @Body() dto: PublishSceneTemplateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MapTemplate> {
    return this.sharing.publish(id, dto, user);
  }

  @ApiOperation({ summary: 'Stáhnout šablonu z katalogu (owner, 22.5)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async unpublish(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<MapTemplate> {
    return this.sharing.unpublish(id, user);
  }

  @ApiOperation({ summary: 'Schválit publikovanou šablonu (kurátor, 22.5)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'NOT_CURATOR' })
  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<MapTemplate> {
    return this.sharing.approve(id, user);
  }

  @ApiOperation({ summary: 'Zamítnout publikovanou šablonu (kurátor, 22.5)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'NOT_CURATOR' })
  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<MapTemplate> {
    return this.sharing.reject(id, user);
  }
}

// Export helper pro testy
export { filterOutPcTokens };
