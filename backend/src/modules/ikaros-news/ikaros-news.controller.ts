import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { IkarosNewsService } from './ikaros-news.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateIkarosNewsDto } from './dto/create-ikaros-news.dto';
import { UpdateIkarosNewsDto } from './dto/update-ikaros-news.dto';
import { UserRole } from '../users/interfaces/user.interface';
import type { NewsScope } from './interfaces/ikaros-news-repository.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

/**
 * D-068 — parse `?limit=` / `?offset=` query string na bezpečné int.
 * `max` shora omezí velikost stránky (default `Infinity`). Vrací `undefined`
 * pokud vstup chybí, není číslo, nebo je <= 0.
 */
function parsePositiveInt(
  raw: string | undefined,
  opts: { max?: number } = {},
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return opts.max !== undefined ? Math.min(n, opts.max) : n;
}

/**
 * Spec 3.1 — validuje a parsuje `?scope`. Default `'active'` (BC pro dashboard
 * 2.1 — anonymní/přihlášený volá `GET /IkarosNews` bez query a očekává aktivní).
 */
function parseScope(raw: string | undefined): NewsScope {
  if (raw === undefined || raw === '' || raw === 'active') return 'active';
  if (raw === 'archived' || raw === 'all') return raw;
  throw new BadRequestException({
    code: 'IKAROS_NEWS_INVALID_SCOPE',
    message: 'Neplatná hodnota ?scope (povoleno: active, archived, all).',
  });
}

/**
 * Spec 3.1 — `scope=archived|all` vyžaduje Admin/Superadmin. `scope=active`
 * je veřejně dostupný (anon i přihlášený). Anon bez JWT na non-active scopes
 * → 401, přihlášený s nedostatečnou rolí → 403.
 */
function assertAdminForNonActiveScope(scope: NewsScope, req: Request): void {
  if (scope === 'active') return;
  const user = (req as Request & { user?: RequestUser }).user;
  if (!user)
    throw new UnauthorizedException({
      code: 'IKAROS_NEWS_AUTH_REQUIRED',
      message: 'Pro tento scope je potřeba přihlášení.',
    });
  if (user.role !== UserRole.Admin && user.role !== UserRole.Superadmin)
    throw new ForbiddenException({
      code: 'FORBIDDEN_PLATFORM_ROLE',
      message: 'Nedostatečná oprávnění',
    });
}

@ApiTags('Ikaros News')
@Controller('IkarosNews')
export class IkarosNewsController {
  constructor(private readonly service: IkarosNewsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Platformové novinky. ?scope=active (default, public) | archived | all (oba Admin+).',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['active', 'archived', 'all'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  @ApiResponse({ status: 403 })
  findAll(
    @Req() req: Request,
    @Query('scope') scopeRaw?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const scope = parseScope(scopeRaw);
    assertAdminForNonActiveScope(scope, req);
    const limit = parsePositiveInt(limitStr, { max: 100 });
    const offset = parsePositiveInt(offsetStr);
    return this.service.findAll({ scope, limit, offset });
  }

  /**
   * D-068 + Spec 3.1 — total count pro paginační meta. `?scope` se stejnou
   * authz logikou jako findAll.
   */
  @Get('count')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Počet novinek (default active, archived/all = Admin+).',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['active', 'archived', 'all'],
  })
  @ApiResponse({ status: 200 })
  async count(@Req() req: Request, @Query('scope') scopeRaw?: string) {
    const scope = parseScope(scopeRaw);
    assertAdminForNonActiveScope(scope, req);
    return { total: await this.service.count(scope) };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vytvoření novinky (Admin/Superadmin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(@Body() dto: CreateIkarosNewsDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update novinky (Admin/Superadmin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIkarosNewsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.role);
  }

  @Post(':id/archive')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archivace novinky (Admin/Superadmin, idempotent)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  archive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.archive(id, user.id, user.role);
  }

  @Post(':id/unarchive')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obnovení archivované novinky (Admin/Superadmin, idempotent)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  unarchive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.unarchive(id, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Smazání novinky (Admin/Superadmin, hard delete)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role);
  }
}
