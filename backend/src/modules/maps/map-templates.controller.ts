import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode, NotFoundException, Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { MapsService } from './maps.service';
import type { IMapTemplatesRepository } from './interfaces/map-templates-repository.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('map-templates')
export class MapTemplatesController {
  constructor(
    @Inject('IMapTemplatesRepository') private readonly repo: IMapTemplatesRepository,
    private readonly mapsService: MapsService,
  ) {}

  @Get()
  findAll() {
    return this.repo.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const tpl = await this.repo.findById(id);
    if (!tpl) throw new NotFoundException('Šablona nenalezena');
    return tpl;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: Record<string, unknown>, @CurrentUser() user: RequestUser) {
    if (user.role > UserRole.PJ) throw new NotFoundException('Nedostatečná oprávnění');
    return this.repo.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async replace(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.role > UserRole.PJ) throw new NotFoundException('Nedostatečná oprávnění');
    await this.repo.replace(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    if (user.role > UserRole.PJ) throw new NotFoundException('Nedostatečná oprávnění');
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Šablona nenalezena');
  }
}
