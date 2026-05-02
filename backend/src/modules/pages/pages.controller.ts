import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { PagesService } from './pages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('worlds/:worldId/pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Param('worldId') worldId: string,
    @Query('type') type?: string,
  ) {
    return this.pagesService.findByWorld(worldId, type);
  }

  @Get('directory')
  @UseGuards(JwtAuthGuard)
  getDirectory(@Param('worldId') worldId: string) {
    return this.pagesService.findDirectory(worldId);
  }

  @Get('dataSlugs')
  @UseGuards(JwtAuthGuard)
  getDataSlugs(@Param('worldId') worldId: string) {
    return this.pagesService.findAllSlugs(worldId);
  }

  @Get('data')
  @UseGuards(JwtAuthGuard)
  getData(
    @Param('worldId') worldId: string,
    @Query('number') number?: string,
  ) {
    return this.pagesService.findRandom(worldId, number ? parseInt(number, 10) : 5);
  }

  @Get('meta/:slug')
  @UseGuards(JwtAuthGuard)
  getMeta(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
  ) {
    return this.pagesService.findMeta(slug, worldId);
  }

  @Get(':slug')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.findBySlug(slug, worldId, user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreatePageDto,
  ) {
    return this.pagesService.create(dto, worldId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.pagesService.update(id, worldId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    return this.pagesService.delete(id, worldId);
  }
}
