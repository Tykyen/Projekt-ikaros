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
  findAll(@Param('worldId') worldId: string, @Query('type') type?: string) {
    return this.pagesService.findByWorld(worldId, type);
  }

  @Get('directory')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Adresářový přehled stránek (slug + title)' })
  @ApiResponse({ status: 200, description: 'OK' })
  getDirectory(@Param('worldId') worldId: string) {
    return this.pagesService.findDirectory(worldId);
  }

  @Get('dataSlugs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Všechny slugy stránek světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  getDataSlugs(@Param('worldId') worldId: string) {
    return this.pagesService.findAllSlugs(worldId);
  }

  @Get('data')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Stránky dle počtu ?number=N' })
  @ApiResponse({ status: 200, description: 'OK' })
  getData(@Param('worldId') worldId: string, @Query('number') number?: string) {
    return this.pagesService.findRandom(
      worldId,
      number ? parseInt(number, 10) : 5,
    );
  }

  @Get('meta/:slug')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Metadata stránky dle slugu' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Stránka nenalezena' })
  getMeta(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    return this.pagesService.findMeta(slug, worldId);
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
    return this.pagesService.findBySlug(slug, worldId, user.id);
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

  @Post(':slug/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Přidat stránku do oblíbených' })
  @ApiResponse({ status: 200, description: 'OK' })
  addFavorite(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    return this.pagesService.addFavorite(worldId, slug);
  }

  @Delete(':slug/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Odebrat stránku z oblíbených' })
  @ApiResponse({ status: 200, description: 'OK' })
  removeFavorite(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
  ) {
    return this.pagesService.removeFavorite(worldId, slug);
  }
}
