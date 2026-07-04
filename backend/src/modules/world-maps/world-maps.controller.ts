import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorldMapsService } from './world-maps.service';
import { CreateMapDto } from './dto/create-map.dto';
import { UpdateMapDto } from './dto/update-map.dto';
import { CreatePinDto } from './dto/create-pin.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { ReorderMapsDto } from './dto/reorder-maps.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  role: UserRole;
  // world elevation — admin bypass jen pro elevované světy (worldAdminBypass).
  elevatedWorldIds?: string[];
}

@ApiTags('World Maps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('world-maps')
export class WorldMapsController {
  constructor(private readonly service: WorldMapsService) {}

  @Get()
  @ApiOperation({ summary: 'Atlas map světa (s visibility filtrem)' })
  @ApiResponse({ status: 200 })
  async list(
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const isPjOrAdmin = await this.service.canManage(user, worldId);
    return this.service.list(worldId, user.id, isPjOrAdmin);
  }

  @Post(':worldId/maps')
  @ApiOperation({ summary: 'Přidat mapu (PJ+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.create(worldId, dto);
  }

  @Patch(':worldId/maps/:mapId')
  @ApiOperation({ summary: 'Upravit mapu (PJ+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async update(
    @Param('worldId') worldId: string,
    @Param('mapId') mapId: string,
    @Body() dto: UpdateMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.update(worldId, mapId, dto);
  }

  @Delete(':worldId/maps/:mapId')
  @ApiOperation({ summary: 'Smazat mapu (PJ+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async remove(
    @Param('worldId') worldId: string,
    @Param('mapId') mapId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    await this.service.remove(worldId, mapId);
    return { ok: true };
  }

  @Patch(':worldId/reorder')
  @ApiOperation({ summary: 'Změnit pořadí map (PJ+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async reorder(
    @Param('worldId') worldId: string,
    @Body() dto: ReorderMapsDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.reorder(worldId, dto.orderedIds);
  }

  // ── Vlaječky (16.5) ─────────────────────────────────────────────────────────

  @Post(':worldId/maps/:mapId/pins')
  @ApiOperation({ summary: 'Přidat vlaječku na mapu (PJ+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async createPin(
    @Param('worldId') worldId: string,
    @Param('mapId') mapId: string,
    @Body() dto: CreatePinDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.createPin(worldId, mapId, dto);
  }

  @Patch(':worldId/maps/:mapId/pins/:pinId')
  @ApiOperation({ summary: 'Upravit vlaječku (PJ+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async updatePin(
    @Param('worldId') worldId: string,
    @Param('mapId') mapId: string,
    @Param('pinId') pinId: string,
    @Body() dto: UpdatePinDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.updatePin(worldId, mapId, pinId, dto);
  }

  @Delete(':worldId/maps/:mapId/pins/:pinId')
  @ApiOperation({ summary: 'Smazat vlaječku (PJ+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async removePin(
    @Param('worldId') worldId: string,
    @Param('mapId') mapId: string,
    @Param('pinId') pinId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.removePin(worldId, mapId, pinId);
  }

  // ── Složky (13.4b F2) ──────────────────────────────────────────────────────

  @Get('folders')
  @ApiOperation({ summary: 'Strom složek atlasu (s visibility filtrem)' })
  @ApiResponse({ status: 200 })
  async listFolders(
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const isPjOrAdmin = await this.service.canManage(user, worldId);
    return this.service.listFolders(worldId, user.id, isPjOrAdmin);
  }

  @Post(':worldId/folders')
  @ApiOperation({ summary: 'Vytvořit složku (PJ+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async createFolder(
    @Param('worldId') worldId: string,
    @Body() dto: CreateFolderDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.createFolder(worldId, dto);
  }

  @Patch(':worldId/folders-reorder')
  @ApiOperation({ summary: 'Změnit pořadí složek (PJ+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async reorderFolders(
    @Param('worldId') worldId: string,
    @Body() dto: ReorderMapsDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.reorderFolders(worldId, dto.orderedIds);
  }

  @Patch(':worldId/folders/:folderId')
  @ApiOperation({ summary: 'Upravit složku (PJ+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async updateFolder(
    @Param('worldId') worldId: string,
    @Param('folderId') folderId: string,
    @Body() dto: UpdateFolderDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    return this.service.updateFolder(worldId, folderId, dto);
  }

  @Delete(':worldId/folders/:folderId')
  @ApiOperation({ summary: 'Smazat složku — obsah do rodiče (PJ+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async removeFolder(
    @Param('worldId') worldId: string,
    @Param('folderId') folderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    await this.service.removeFolder(worldId, folderId);
    return { ok: true };
  }
}
