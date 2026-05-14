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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IkarosArticlesService } from './ikaros-articles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { RateArticleDto } from './dto/rate-article.dto';
import { RejectArticleDto } from './dto/reject-article.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@ApiTags('Ikaros Articles')
@ApiBearerAuth()
@Controller('ikaros-articles')
@UseGuards(JwtAuthGuard)
export class IkarosArticlesController {
  constructor(private readonly service: IkarosArticlesService) {}

  @Get()
  @ApiOperation({ summary: 'Publikované články + pending pro admina' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.role, user.username);
  }

  @Get('my')
  @ApiOperation({ summary: 'Vlastní články aktuálního uživatele' })
  @ApiResponse({ status: 200 })
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user.id);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Články čekající na schválení (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('stats')
  findStats(@CurrentUser() user: RequestUser) {
    return this.service.findStats(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail článku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  @ApiOperation({ summary: 'Vytvoření článku (Draft)' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editace článku (jen Draft nebo Rejected)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id, user.role, user.username);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání článku' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role, user.username);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Odeslání článku ke schválení (Draft → Pending)' })
  @ApiResponse({ status: 200 })
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submit(id, user.id, user.role);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Schválení článku (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Zamítnutí článku s důvodem (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectArticleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Hodnocení článku 1–5 hvězdiček' })
  @ApiResponse({ status: 200 })
  rate(
    @Param('id') id: string,
    @Body() dto: RateArticleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.rate(id, dto.stars, user.id, user.role);
  }
}
