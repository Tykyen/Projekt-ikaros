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
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { MapsService } from './maps.service';
import type { IMapTemplatesRepository } from './interfaces/map-templates-repository.interface';

interface RequestUser {
  id: string;
  role: UserRole;
}

@ApiTags('Map Templates')
@ApiBearerAuth()
@Controller('map-templates')
export class MapTemplatesController {
  constructor(
    @Inject('IMapTemplatesRepository')
    private readonly repo: IMapTemplatesRepository,
    private readonly mapsService: MapsService,
  ) {}

  @ApiOperation({ summary: 'Znovupoužitelné šablony scén' })
  @ApiResponse({ status: 200 })
  @Get()
  findAll() {
    return this.repo.findAll();
  }

  @ApiOperation({ summary: 'Detail šablony' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @Get(':id')
  async findById(@Param('id') id: string) {
    const tpl = await this.repo.findById(id);
    if (!tpl) throw new NotFoundException('Šablona nenalezena');
    return tpl;
  }

  @ApiOperation({ summary: 'Vytvoření šablony (PJ/Admin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.role > UserRole.PJ)
      throw new NotFoundException('Nedostatečná oprávnění');
    return this.repo.create(dto);
  }

  @ApiOperation({ summary: 'Aktualizace šablony' })
  @ApiResponse({ status: 204, description: 'Šablona aktualizována' })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async replace(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.role > UserRole.PJ)
      throw new NotFoundException('Nedostatečná oprávnění');
    await this.repo.replace(id, dto);
  }

  @ApiOperation({ summary: 'Smazání šablony' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    if (user.role > UserRole.PJ)
      throw new NotFoundException('Nedostatečná oprávnění');
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Šablona nenalezena');
  }
}
