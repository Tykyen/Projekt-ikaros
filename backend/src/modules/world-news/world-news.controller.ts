import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WorldNewsService } from './world-news.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CreateWorldNewsDto } from './dto/create-world-news.dto';
import { UpdateWorldNewsDto } from './dto/update-world-news.dto';
import { QueryWorldNewsDto } from './dto/query-world-news.dto';
import type { WorldNewsItem } from './interfaces/world-news.interface';

type PublicWorldNews = Omit<WorldNewsItem, 'createdBy'>;

// createdBy je interní audit field; nikdy nezveřejnit v API odpovědi.
function toPublic({
  createdBy: _createdBy,
  ...rest
}: WorldNewsItem): PublicWorldNews {
  return rest;
}

@ApiTags('World News')
@Controller('world-news')
export class WorldNewsController {
  constructor(private readonly service: WorldNewsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Seznam novinek. Bez worldId = vše. ?scope=active (default, public) | archived | all (oba PomocnyPJ+/Admin).',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  @ApiResponse({ status: 403 })
  async findMany(
    @Query() query: QueryWorldNewsDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<PublicWorldNews[]> {
    const items = await this.service.findMany({
      worldId: query.worldId,
      limit: query.limit,
      scope: query.scope,
      offset: query.offset,
      requester: user,
    });
    return items.map(toPublic);
  }

  @Get('count')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Počet novinek (default scope active; archived/all PomocnyPJ+).',
  })
  @ApiResponse({ status: 200 })
  async count(
    @Query() query: QueryWorldNewsDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ total: number }> {
    const total = await this.service.count({
      worldId: query.worldId,
      scope: query.scope,
      requester: user,
    });
    return { total };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail novinky (anonymní)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findById(@Param('id') id: string): Promise<PublicWorldNews> {
    return toPublic(await this.service.findById(id));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vytvoř novinku (Admin/Superadmin/PJ/PomocnyPJ)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async create(
    @Body() dto: CreateWorldNewsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PublicWorldNews> {
    return toPublic(await this.service.create(dto, user));
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aktualizuj novinku (partial)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'worldId v body zakázán' })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorldNewsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PublicWorldNews> {
    return toPublic(await this.service.update(id, dto, user));
  }

  @Post(':id/archive')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Archivuj novinku (PomocnyPJ+/Admin, idempotentní)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PublicWorldNews> {
    return toPublic(await this.service.archive(id, user));
  }

  @Post(':id/unarchive')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obnov novinku z archivu (PomocnyPJ+/Admin, idempotentní)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async unarchive(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PublicWorldNews> {
    return toPublic(await this.service.unarchive(id, user));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Smaž novinku' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.delete(id, user);
  }
}
