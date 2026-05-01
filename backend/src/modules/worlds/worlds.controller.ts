import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { WorldsService } from './worlds.service';
import type { RequestUser } from './worlds.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateWorldDto } from './dto/create-world.dto';
import { UpdateWorldDto } from './dto/update-world.dto';
import { UpdateWorldSettingsDto } from './dto/update-world-settings.dto';
import {
  UpdateMemberRoleDto,
  UpdateMemberGroupDto,
  UpdateMemberAkjDto,
} from './dto/update-member.dto';

@Controller('worlds')
export class WorldsController {
  constructor(private readonly worldsService: WorldsService) {}

  @Get()
  findAll() {
    return this.worldsService.findAll();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  findMy(@CurrentUser() user: { id: string }) {
    return this.worldsService.findMyWorlds(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.worldsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateWorldDto, @CurrentUser() user: { id: string }) {
    return this.worldsService.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorldDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.worldsService.softDelete(id, user);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  join(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.worldsService.join(id, user.id);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.worldsService.getMembers(id);
  }

  @Get(':worldId/settings')
  getSettings(@Param('worldId') worldId: string) {
    return this.worldsService.getSettings(worldId);
  }

  @Put(':worldId/settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateWorldSettingsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateSettings(worldId, dto, user);
  }

  @Patch(':worldId/members/:membershipId/role')
  @UseGuards(JwtAuthGuard)
  updateMemberRole(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberRole(membershipId, dto.role, user);
  }

  @Patch(':worldId/members/:membershipId/group')
  @UseGuards(JwtAuthGuard)
  updateMemberGroup(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberGroup(membershipId, dto.group, user);
  }

  @Patch(':worldId/members/:membershipId/akj')
  @UseGuards(JwtAuthGuard)
  updateMemberAkj(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberAkjDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberAkj(membershipId, dto.akj, user);
  }
}
