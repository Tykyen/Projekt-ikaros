import { Controller, Get, Put, Patch, Query, Param, Body, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UniverseService } from './universe.service';
import { UpdateUniverseDto } from './dto/update-universe.dto';
import { UpdateNodeVisibilityDto } from './dto/update-node-visibility.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('universe')
export class UniverseController {
  constructor(private readonly service: UniverseService) {}

  @Get()
  async findByWorld(@Query('worldId') worldId: string, @Req() req: Request) {
    const user = (req as Request & { user?: RequestUser }).user;
    const userId = user?.id ?? null;
    const isPjOrAdmin = user ? user.role <= UserRole.Admin : false;
    return this.service.findByWorld(worldId, userId, isPjOrAdmin);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  async update(
    @Query('worldId') worldId: string,
    @Body() dto: UpdateUniverseDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.update(worldId, dto);
  }

  @Patch(':worldId/nodes/:nodeId/visibility')
  @UseGuards(JwtAuthGuard)
  async updateNodeVisibility(
    @Param('worldId') worldId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeVisibilityDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.updateNodeVisibility(worldId, nodeId, dto);
  }
}
