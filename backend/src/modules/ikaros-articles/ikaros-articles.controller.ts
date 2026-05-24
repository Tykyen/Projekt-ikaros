import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IkarosArticlesService } from './ikaros-articles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
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
@Controller('ikaros-articles')
export class IkarosArticlesController {
  constructor(private readonly service: IkarosArticlesService) {}

  // ─── Anon-friendly read ──────────────────────────────────────────────────
  // 3.2a — `OptionalJwtAuthGuard` umožní anon vidět Published; admin
  // navíc Pending. Auth user vidí Published + vlastní.

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Publikované články (+ Pending pro admina, anon read). Volitelný `?search=` fulltext.',
  })
  findAll(
    @CurrentUser() user: RequestUser | undefined,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(user?.role, user?.username, search);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vlastní články aktuálního uživatele' })
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user.id);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Články čekající na schválení (Admin)' })
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  findStats(@CurrentUser() user: RequestUser) {
    return this.service.findStats(user.id);
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Počet nepřečtených Published článků (3.2a)' })
  async unreadCount(@CurrentUser() user: RequestUser) {
    const count = await this.service.unreadCountForUser(user.id);
    return { count };
  }

  @Get('my-favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Oblíbené články aktuálního uživatele (3.7)' })
  findMyFavorites(@CurrentUser() user: RequestUser) {
    return this.service.findMyFavorites(user.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Detail článku (anon vidí jen Published)' })
  findById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.service.findById(id, user?.id, user?.role, user?.username);
  }

  @Get(':id/read-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Zda uživatel článek už dočetl (3.2a)' })
  async readStatus(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const read = await this.service.isReadByUser(id, user.id);
    return { read };
  }

  @Get(':id/versions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'D-NEW-article-versions — historie revizí (autor nebo admin)',
  })
  getVersions(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.getVersions(id, user.id, user.role, user.username);
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vytvoření článku (Draft nebo Pending při dto.submit)',
  })
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Editace článku (jen Draft nebo Rejected, jen autor)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id, user.role, user.username);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role, user.username);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submit(id, user.id, user.role);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  reject(
    @Param('id') id: string,
    @Body() dto: RejectArticleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reject(id, dto.reason, user.role, user.username);
  }

  /**
   * D-NEW-bulk-pending-articles (2026-05-21) — Bulk approve/reject pro
   * SpravciClanku. Vrací `{succeeded, failed}` summary.
   */
  @Post('bulk/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  bulkApprove(
    @Body() dto: { ids: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.bulkApprove(dto.ids, user.role, user.username);
  }

  @Post('bulk/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  bulkReject(
    @Body() dto: { ids: string[]; reason?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.bulkReject(
      dto.ids,
      dto.reason,
      user.role,
      user.username,
    );
  }

  @Post(':id/rate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  rate(
    @Param('id') id: string,
    @Body() dto: RateArticleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.rate(
      id,
      dto.stars,
      user.id,
      user.role,
      user.username,
      dto.text,
    );
  }

  @Post(':id/mark-read')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Označit článek za přečtený (3.2a, idempotent)' })
  async markRead(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.markRead(id, user.id);
  }

  @Post(':id/toggle-favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle oblíbený článek (3.7)' })
  toggleFavorite(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.toggleFavorite(id, user.id);
  }

  @Post(':id/toggle-pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle připnutí článku do sidebaru — max 5 (3.7)' })
  togglePin(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.togglePin(id, user.id);
  }
}
