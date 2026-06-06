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
import { ReorderMapsDto } from './dto/reorder-maps.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  role: UserRole;
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
    const isPjOrAdmin = await this.service.canManage(
      user.id,
      user.role,
      worldId,
    );
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
    await this.service.assertCanManage(user.id, user.role, worldId);
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
    await this.service.assertCanManage(user.id, user.role, worldId);
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
    await this.service.assertCanManage(user.id, user.role, worldId);
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
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.reorder(worldId, dto.orderedIds);
  }
}
