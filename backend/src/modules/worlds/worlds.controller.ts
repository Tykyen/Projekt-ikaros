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
  UpdateMemberCharacterDto,
  UpdateMemberFreeDto,
} from './dto/update-member.dto';
import { PagesService } from '../pages/pages.service';

@Controller('worlds')
export class WorldsController {
  constructor(
    private readonly worldsService: WorldsService,
    private readonly pagesService: PagesService,
  ) {}

  @Get()
  findAll() {
    return this.worldsService.findAll();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  findMy(@CurrentUser() user: { id: string }) {
    return this.worldsService.findMyWorlds(user.id);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.worldsService.findBySlug(slug);
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
  join(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.worldsService.join(id, user.id, user.username);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.worldsService.getMembers(id);
  }

  @Delete(':worldId/members/:membershipId')
  @UseGuards(JwtAuthGuard)
  leave(
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.leave(membershipId, user);
  }

  @Get(':worldId/settings')
  @UseGuards(JwtAuthGuard)
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

  @Patch(':worldId/members/:membershipId/character')
  @UseGuards(JwtAuthGuard)
  updateMemberCharacter(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberCharacter(membershipId, dto.characterPath, user);
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

  @Patch(':worldId/members/:membershipId/free')
  @UseGuards(JwtAuthGuard)
  updateMemberFree(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberFreeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberFree(membershipId, dto.isFree, user);
  }

  @Get(':worldId/favorites')
  @UseGuards(JwtAuthGuard)
  getFavorites(@Param('worldId') worldId: string) {
    return this.pagesService.findFavorites(worldId);
  }
}
