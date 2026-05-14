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
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorldsService } from './worlds.service';
import type { RequestUser } from './worlds.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateWorldDto } from './dto/create-world.dto';
import { UpdateWorldDto } from './dto/update-world.dto';
import { UpdateWorldSettingsDto } from './dto/update-world-settings.dto';
import { UpdateCalendarConfigDto } from './dto/update-calendar-config.dto';
import {
  UpdateMemberRoleDto,
  UpdateMemberGroupDto,
  UpdateMemberAkjDto,
  UpdateMemberCharacterDto,
  UpdateMemberFreeDto,
} from './dto/update-member.dto';
import { PagesService } from '../pages/pages.service';

@ApiTags('Worlds')
@ApiBearerAuth()
@Controller('worlds')
export class WorldsController {
  constructor(
    private readonly worldsService: WorldsService,
    private readonly pagesService: PagesService,
  ) {}

  // D-016 — Read endpointy s OptionalJwtAuthGuard: anon vidí jen public/open
  // světy; auth uživatel vidí navíc světy kde je členem (filter v service).
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Seznam všech světů (anon = public/open, auth = + members)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  findAll() {
    return this.worldsService.findAll();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Světy aktuálního uživatele (člen nebo vlastník)' })
  @ApiResponse({ status: 200, description: 'OK' })
  findMy(@CurrentUser() user: { id: string }) {
    return this.worldsService.findMyWorlds(user.id);
  }

  // 2.3 D-NEW-slug-check — public availability check, žádný auth.
  @Get('slug-available')
  @ApiOperation({ summary: 'Live check, zda je slug volný' })
  @ApiResponse({ status: 200, description: '{ available: boolean }' })
  async slugAvailable(@Query('slug') slug?: string) {
    const available = slug
      ? await this.worldsService.isSlugAvailable(slug)
      : false;
    return { available };
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Detail světa dle slugu' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  findBySlug(@Param('slug') slug: string) {
    return this.worldsService.findBySlug(slug);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Detail světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  findOne(@Param('id') id: string) {
    return this.worldsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vytvoření nového světa' })
  @ApiResponse({ status: 201, description: 'Svět vytvořen' })
  @ApiResponse({ status: 403, description: 'WORLD_QUOTA_REACHED' })
  @ApiResponse({ status: 409, description: 'WORLD_SLUG_TAKEN' })
  create(@Body() dto: CreateWorldDto, @CurrentUser() user: RequestUser) {
    return this.worldsService.create(dto, user.id, user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace metadat světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorldDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Smazání světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.worldsService.softDelete(id, user);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Žádost o vstup do světa nebo přímé připojení' })
  @ApiResponse({ status: 200, description: 'OK' })
  join(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.worldsService.join(id, user.id, user.username);
  }

  // 2.4 — Resolve flow pro pending Zadatel žádosti (owner + Admin/Superadmin).
  @Post(':worldId/join-requests/:membershipId/accept')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Schválit žádost o vstup (Zadatel → Hrac)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'JOIN_REQUEST_NOT_FOUND' })
  acceptJoinRequest(
    @Param('worldId') worldId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.acceptJoinRequest(worldId, membershipId, user);
  }

  @Post(':worldId/join-requests/:membershipId/reject')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Zamítnout žádost o vstup (delete membership)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'JOIN_REQUEST_NOT_FOUND' })
  rejectJoinRequest(
    @Param('worldId') worldId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.rejectJoinRequest(worldId, membershipId, user);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Členové světa s filtry ?role= &group=' })
  @ApiResponse({ status: 200, description: 'OK' })
  getMembers(
    @Param('id') id: string,
    @Query('role') role?: string,
    @Query('group') group?: string,
  ) {
    const filters: { role?: number; group?: string } = {};
    if (role !== undefined) {
      const roleNum = Number(role);
      if (!Number.isInteger(roleNum))
        throw new BadRequestException('Neplatná hodnota role');
      filters.role = roleNum;
    }
    if (group !== undefined) filters.group = group;
    return this.worldsService.getMembers(
      id,
      Object.keys(filters).length ? filters : undefined,
    );
  }

  @Delete(':worldId/members/:membershipId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Opuštění nebo odebrání člena ze světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  leave(
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.leave(membershipId, user);
  }

  @Get(':worldId/settings')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Načte nastavení světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  getSettings(@Param('worldId') worldId: string) {
    return this.worldsService.getSettings(worldId);
  }

  @Put(':worldId/settings')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Uloží nastavení světa (PJ/Admin)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  updateSettings(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateWorldSettingsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateSettings(worldId, dto, user);
  }

  @Put(':worldId/calendarconfig')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Zápis WorldCalendarConfig (PomocnyPJ+ / Admin)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  updateCalendarConfig(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateCalendarConfigDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateCalendarConfig(worldId, dto, user);
  }

  @Patch(':worldId/members/:membershipId/role')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Změna role člena ve světě' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  updateMemberRole(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberRole(membershipId, dto.role, user);
  }

  @Patch(':worldId/members/:membershipId/group')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Změna skupiny člena ve světě' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  updateMemberGroup(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberGroup(membershipId, dto.group, user);
  }

  @Patch(':worldId/members/:membershipId/character')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Přiřazení postavy členovi světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  updateMemberCharacter(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberCharacter(
      membershipId,
      dto.characterPath,
      user,
    );
  }

  @Patch(':worldId/members/:membershipId/akj')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace AKJ hodnoty člena' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  updateMemberAkj(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberAkjDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberAkj(membershipId, dto.akj, user);
  }

  @Patch(':worldId/members/:membershipId/free')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Toggle isFree flagu člena' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  updateMemberFree(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberFreeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMemberFree(membershipId, dto.isFree, user);
  }

  @Get(':worldId/favorites')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Oblíbené stránky uživatele ve světě' })
  @ApiResponse({ status: 200, description: 'OK' })
  getFavorites(@Param('worldId') worldId: string) {
    return this.pagesService.findFavorites(worldId);
  }

  @Get(':id/diary-schema-versions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seznam verzí diary schématu (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  getDiarySchemaVersions(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.getDiarySchemaVersions(id, user);
  }

  @Get(':id/diary-schema-versions/:version')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detail verze diary schématu (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  getDiarySchemaVersion(
    @Param('id') id: string,
    @Param('version') version: string,
    @CurrentUser() user: RequestUser,
  ) {
    const v = parseInt(version, 10);
    if (Number.isNaN(v) || v < 1) {
      throw new BadRequestException('version musí být kladné celé číslo');
    }
    return this.worldsService.getDiarySchemaVersion(id, v, user);
  }
}
