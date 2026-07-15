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
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  role: UserRole;
  // world elevation — admin bypass jen pro elevované světy (worldAdminBypass).
  elevatedWorldIds?: string[];
}

// 22.4 vitrína — guard už NENÍ class-level: read routy (list/listFolders) mají
// OptionalJwt (anonym jen přes zapnuté veřejné nahlížení, brána v service),
// VŠECHNY ostatní routy MUSÍ mít explicitní @UseGuards(JwtAuthGuard).
@ApiTags('World Maps')
@ApiBearerAuth()
@Controller('world-maps')
export class WorldMapsController {
  constructor(private readonly service: WorldMapsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Atlas map světa (s visibility filtrem); vitrína i anonymně (22.4)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async list(
    @Query('worldId') worldId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (user === undefined) {
      // 22.4 — anonym: jen vitrínový svět, pohled hráče bez id (isPublic mapy).
      await this.service.assertShowcaseView(worldId);
      return this.service.list(worldId, null, false);
    }
    await this.service.assertCanViewAtlas(user, worldId);
    const isPjOrAdmin = await this.service.canManage(user, worldId);
    return this.service.list(worldId, user.id, isPjOrAdmin);
  }

  @Post(':worldId/maps')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Strom složek atlasu (s visibility filtrem); vitrína i anonymně (22.4)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async listFolders(
    @Query('worldId') worldId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (user === undefined) {
      // 22.4 — anonym: jen vitrínový svět, pohled hráče bez id (viz list()).
      await this.service.assertShowcaseView(worldId);
      return this.service.listFolders(worldId, null, false);
    }
    await this.service.assertCanViewAtlas(user, worldId);
    const isPjOrAdmin = await this.service.canManage(user, worldId);
    return this.service.listFolders(worldId, user.id, isPjOrAdmin);
  }

  @Post(':worldId/folders')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
