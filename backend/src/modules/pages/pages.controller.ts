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

  @Patch(':slug')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.pagesService.update(slug, worldId, dto);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
  ) {
    return this.pagesService.delete(slug, worldId);
  }
}
