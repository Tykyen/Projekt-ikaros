import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Query, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { MapsService } from './maps.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateMapDto } from './dto/create-map.dto';
import { MoveTokenDto } from './dto/move-token.dto';
import { RemoveTokenDto } from './dto/remove-token.dto';

interface RequestUser { id: string; role: UserRole }

@Controller('maps')
export class MapsController {
  constructor(private readonly service: MapsService) {}

  @Get()
  findByWorld(@Query('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @Get('active')
  findActive(@Query('worldId') worldId: string) {
    return this.service.findActive(worldId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateMapDto, @CurrentUser() user: RequestUser) {
    const worldId = dto.worldId ?? '';
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.create(dto as unknown as Partial<import('./interfaces/map-scene.interface').MapScene>, worldId);
  }

  @Post(':id/active')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async setActive(
    @Param('id') id: string,
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    await this.service.setActive(id, worldId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async replace(
    @Param('id') id: string,
    @Body() dto: CreateMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    const worldId = dto.worldId ?? '';
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.replace(id, dto as unknown as Partial<import('./interfaces/map-scene.interface').MapScene>);
  }

  @Patch(':id/move-token')
  @UseGuards(JwtAuthGuard)
  moveToken(
    @Param('id') sceneId: string,
    @Body() dto: MoveTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.moveToken(sceneId, dto, user.id, user.role);
  }

  @Patch(':id/remove-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async removeToken(
    @Param('id') sceneId: string,
    @Body() dto: RemoveTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.removeToken(sceneId, dto.tokenId, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(@Param('id') id: string, @Query('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    await this.service.deleteScene(id);
  }
}
