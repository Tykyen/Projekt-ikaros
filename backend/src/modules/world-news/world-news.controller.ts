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
@Controller('news')
export class WorldNewsController {
  constructor(private readonly service: WorldNewsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Seznam novinek (anonymní). Bez worldId = vše. S worldId = svět + globální.',
  })
  @ApiResponse({ status: 200 })
  async findMany(
    @Query() query: QueryWorldNewsDto,
  ): Promise<PublicWorldNews[]> {
    const items = await this.service.findMany({
      worldId: query.worldId,
      limit: query.limit,
    });
    return items.map(toPublic);
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
