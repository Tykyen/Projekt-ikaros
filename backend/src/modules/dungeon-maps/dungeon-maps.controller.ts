import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
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
import { DungeonMapsService } from './dungeon-maps.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateDungeonMapDto } from './dto/create-dungeon-map.dto';
import { UpdateDungeonMapDto } from './dto/update-dungeon-map.dto';
import { ExportTemplateDto } from './dto/export-template.dto';
import { ExportSceneDto } from './dto/export-scene.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@ApiTags('Dungeon Maps')
@ApiBearerAuth()
@Controller('dungeon-maps')
@UseGuards(JwtAuthGuard)
export class DungeonMapsController {
  constructor(private readonly service: DungeonMapsService) {}

  @ApiOperation({ summary: 'Tile-based dungeony světa (PJ+)' })
  @ApiResponse({ status: 200 })
  @Get()
  findByWorld(@Query('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @ApiOperation({ summary: 'Detail dungeonu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @ApiOperation({ summary: 'Vytvoření dungeonu' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @Post()
  create(@Body() dto: CreateDungeonMapDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto as never, user.id, user.role);
  }

  @ApiOperation({ summary: 'Aktualizace dungeonu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @Put(':id')
  replace(
    @Param('id') id: string,
    @Body() dto: UpdateDungeonMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.replace(id, dto as never, user.id, user.role);
  }

  @ApiOperation({ summary: 'Smazání dungeonu' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role);
  }

  @ApiOperation({ summary: 'Export dungeonu jako MapTemplate' })
  @ApiResponse({ status: 201 })
  @Post(':id/export-template')
  exportTemplate(
    @Param('id') id: string,
    @Body() dto: ExportTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.exportTemplate(id, dto.imageUrl, user.id, user.role);
  }

  @ApiOperation({ summary: 'Export dungeonu jako MapScene' })
  @ApiResponse({ status: 201 })
  @Post(':id/export-scene')
  exportScene(
    @Param('id') id: string,
    @Body() dto: ExportSceneDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.exportScene(id, dto.imageUrl, user.id, user.role);
  }
}
