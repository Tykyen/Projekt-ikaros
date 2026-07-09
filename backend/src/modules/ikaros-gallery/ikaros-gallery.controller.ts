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
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateGalleryItemDto } from './dto/create-gallery-item.dto';
import { UpdateGalleryItemDto } from './dto/update-gallery-item.dto';
import { RateGalleryItemDto } from './dto/rate-gallery-item.dto';
import { RejectGalleryItemDto } from './dto/reject-gallery-item.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@ApiTags('Ikaros Gallery')
@Controller('ikaros-gallery')
export class IkarosGalleryController {
  constructor(private readonly service: IkarosGalleryService) {}

  // ─── Anon-friendly read ────────────────────────────────────────────────────
  // 3.3a — `OptionalJwtAuthGuard`: anon vidí Published, admin navíc Pending.

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Schválené obrázky galerie (+ Pending pro admina, anon read)',
  })
  @ApiResponse({ status: 200 })
  findAll(@CurrentUser() user: RequestUser | undefined) {
    return this.service.findAll(user?.role, user?.username);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vlastní obrázky aktuálního uživatele' })
  @ApiResponse({ status: 200 })
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user.id);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obrázky čekající na schválení (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Statistiky obrázků autora' })
  @ApiResponse({ status: 200 })
  findStats(@CurrentUser() user: RequestUser) {
    return this.service.findStats(user.id);
  }

  @Get('my-favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Oblíbené obrázky aktuálního uživatele (3.7)' })
  @ApiResponse({ status: 200 })
  findMyFavorites(@CurrentUser() user: RequestUser) {
    return this.service.findMyFavorites(user.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Detail obrázku (anon vidí jen Published)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.service.findById(id, user?.id, user?.role, user?.username);
  }

  // ─── Write ──────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Nahrání obrázku do galerie (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        submit: { type: 'boolean' },
        // 20D (D1) — povinné prohlášení práv + volitelný self-declare AI.
        rightsDeclared: { type: 'boolean' },
        aiOrigin: { type: 'string', enum: ['none', 'ai_image'] },
      },
    },
  })
  @ApiResponse({ status: 201 })
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateGalleryItemDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    // 20D (D3) — IP z requestu jako best-effort doklad souhlasu.
    return this.service.create(
      dto,
      file,
      user.id,
      user.username,
      user.role,
      req.ip,
    );
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editace title/description/category obrázku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGalleryItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id, user.role, user.username);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Smazání obrázku' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role, user.username);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Odeslání ke schválení' })
  @ApiResponse({ status: 200 })
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submit(id, user.id, user.role);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Schválení obrázku (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Zamítnutí obrázku s důvodem (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectGalleryItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/rate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hodnocení obrázku 1–5 hvězdiček' })
  @ApiResponse({ status: 200 })
  rate(
    @Param('id') id: string,
    @Body() dto: RateGalleryItemDto,
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

  @Post(':id/toggle-favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle oblíbený obrázek (3.7)' })
  @ApiResponse({ status: 200 })
  toggleFavorite(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.toggleFavorite(id, user.id);
  }

  @Post(':id/toggle-pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Toggle připnutí obrázku do sidebaru — max 5 (3.7)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 409, description: 'Není oblíbený / limit 5' })
  togglePin(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.togglePin(id, user.id);
  }
}
