import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { DungeonMapsService } from './dungeon-maps.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateDungeonMapDto } from './dto/create-dungeon-map.dto';
import { UpdateDungeonMapDto } from './dto/update-dungeon-map.dto';
import { ExportTemplateDto } from './dto/export-template.dto';
import { ExportSceneDto } from './dto/export-scene.dto';

interface RequestUser { id: string; role: UserRole }

@Controller('dungeon-maps')
@UseGuards(JwtAuthGuard)
export class DungeonMapsController {
  constructor(private readonly service: DungeonMapsService) {}

  @Get()
  findByWorld(@Query('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  create(@Body() dto: CreateDungeonMapDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto as never, user.id, user.role);
  }

  @Put(':id')
  replace(
    @Param('id') id: string,
    @Body() dto: UpdateDungeonMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.replace(id, dto as never, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.delete(id, user.id, user.role);
  }

  @Post(':id/export-template')
  exportTemplate(
    @Param('id') id: string,
    @Body() dto: ExportTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.exportTemplate(id, dto.imageUrl, user.id, user.role);
  }

  @Post(':id/export-scene')
  exportScene(
    @Param('id') id: string,
    @Body() dto: ExportSceneDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.exportScene(id, dto.imageUrl, dto.worldId, user.id, user.role);
  }
}
