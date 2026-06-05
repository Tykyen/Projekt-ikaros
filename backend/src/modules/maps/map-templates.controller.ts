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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { MapsService } from './maps.service';
import { CreateMapTemplateDto } from './dto/create-map-template.dto';
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
  ) {}

  @ApiOperation({
    summary: 'Šablony scén — per-PJ filter (Admin+ vidí všechny)',
  })
  @ApiResponse({ status: 200 })
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@CurrentUser() user: RequestUser): Promise<MapTemplate[]> {
    // 10.2c-edit-2 — Admin+Superadmin globální bypass; ostatní jen své
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
    if (user.role > UserRole.Admin && existing.ownerId !== user.id) {
      throw new ForbiddenException({
        code: 'MAP_TEMPLATE_FORBIDDEN_OWNER',
        message: 'Šablona patří jinému PJ',
      });
    }
    await this.repo.delete(id);
  }
}

// Export helper pro testy
export { filterOutPcTokens };
