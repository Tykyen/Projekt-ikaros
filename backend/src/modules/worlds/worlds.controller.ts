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
  HttpCode,
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
import { TransferWorldOwnershipDto } from './dto/transfer-world-ownership.dto';
import { RestoreWorldDto } from './dto/restore-world.dto';
import { UpdateWorldSettingsDto } from './dto/update-world-settings.dto';
import { UpdateAkjTypesDto } from './dto/update-akj-types.dto';
import { PatchCalendarDefaultsDto } from './dto/patch-calendar-defaults.dto';
import { CreateDiarySchemaVersionDto } from './dto/create-diary-schema-version.dto';
import { CreateWorldInviteDto } from './dto/create-world-invite.dto';
import { RequestAccessDto } from './dto/request-access.dto';
import {
  UpdateMemberRoleDto,
  UpdateMemberGroupDto,
  UpdateMemberAkjDto,
  UpdateMemberCharacterDto,
  UpdateMemberFreeDto,
  UpdateMemberThemeDto,
  UpdateMemberPjAvatarDto,
} from './dto/update-member.dto';

@ApiTags('Worlds')
@ApiBearerAuth()
@Controller('worlds')
export class WorldsController {
  constructor(private readonly worldsService: WorldsService) {}

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

  // ─── Elevation („nahození práv") — jen platform Admin/Superadmin ───────────
  @Post(':worldId/elevation')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktivovat admin pravomoci ve světě (elevation)' })
  @ApiResponse({ status: 201, description: '{ elevated: true }' })
  elevate(@Param('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    return this.worldsService.elevate(worldId, user);
  }

  @Delete(':worldId/elevation')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Složit admin pravomoci ve světě (de-elevation)' })
  @ApiResponse({ status: 200, description: '{ elevated: false }' })
  deElevate(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.deElevate(worldId, user);
  }

  @Get(':worldId/elevation')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Stav admin elevace pro svět' })
  @ApiResponse({ status: 200, description: '{ elevated: boolean }' })
  elevationStatus(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.getElevationStatus(worldId, user);
  }

  // Spec 2.4 — pending access requests current usera (pre-membership pro open/private).
  @Get('my-access-requests')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Pending access requesty aktuálního uživatele (open/private světy)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  findMyAccessRequests(@CurrentUser() user: { id: string }) {
    return this.worldsService.findMyAccessRequests(user.id);
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

  @Get('deleted')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Seznam soft-smazaných světů (Admin/Superadmin)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  listDeleted(@CurrentUser() user: RequestUser) {
    return this.worldsService.listDeleted(user);
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Detail světa dle slugu (private = 404 pro non-member)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen nebo bez přístupu' })
  findBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser | null,
  ) {
    return this.worldsService.findBySlugForRequester(slug, user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Detail světa (private = 404 pro non-member)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen nebo bez přístupu' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser | null) {
    return this.worldsService.findByIdForRequester(id, user);
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

  // D-NEW-slug-rename — atomický rename slugu s redirect historií.
  @Patch(':id/slug')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Změna slug světa (staré odkazy zůstávají funkční)',
  })
  @ApiResponse({
    status: 200,
    description: 'OK — `previousSlugs[]` obsahuje starý',
  })
  @ApiResponse({ status: 400, description: 'Slug nevalidní' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 409, description: 'Slug už používá jiný svět' })
  renameSlug(
    @Param('id') id: string,
    @Body() body: { newSlug: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.renameSlug(id, body.newSlug, user);
  }

  // D-NEW-world-transfer — předání vlastnictví světa jinému členovi.
  @Patch(':id/owner')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Předání vlastnictví světa jinému členovi' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'Nový vlastník není člen světa' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  transferOwnership(
    @Param('id') id: string,
    @Body() dto: TransferWorldOwnershipDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.transferOwnership(id, dto.newOwnerId, user);
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

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Obnova soft-smazaného světa (Admin/Superadmin, do 30 dní)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Jen Admin/Superadmin' })
  @ApiResponse({
    status: 410,
    description: 'Okno pro obnovu (30 dní) vypršelo',
  })
  restore(
    @Param('id') id: string,
    @Body() dto: RestoreWorldDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.restore(id, user, dto.newOwnerId);
  }

  // Spec 2.4 — public svět: okamžitý join, vznikne membership s rolí Čtenář.
  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vstup do public světa (role Čtenář)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'WORLD_NOT_PUBLIC' })
  @ApiResponse({ status: 403, description: 'WORLD_CLOSED' })
  @ApiResponse({ status: 409, description: 'WORLD_ALREADY_MEMBER' })
  joinPublic(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.worldsService.joinPublic(id, user.id);
  }

  // Spec 2.4 — open/private svět: vznikne pre-membership AccessRequest, PJ schvaluje.
  @Post(':id/access-request')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Žádost o vstup do open/private světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'WORLD_IS_PUBLIC' })
  @ApiResponse({ status: 403, description: 'WORLD_CLOSED' })
  @ApiResponse({
    status: 409,
    description: 'WORLD_ALREADY_MEMBER nebo PENDING_ACCESS_REQUEST',
  })
  requestAccess(
    @Param('id') id: string,
    @Body() dto: RequestAccessDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.requestAccess(id, user.id, dto?.characterDraft);
  }

  @Delete(':id/access-request')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Zrušit vlastní pending žádost o vstup' })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 404, description: 'ACCESS_REQUEST_NOT_FOUND' })
  cancelAccessRequest(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.cancelAccessRequest(id, user.id);
  }

  // Spec 2.4 — Resolve flow pro pending access requesty (owner + Admin/Superadmin).
  @Post(':worldId/access-requests/:requestId/approve')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Schválit žádost o vstup (AccessRequest → membership Čtenář)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'ACCESS_REQUEST_NOT_FOUND' })
  approveAccessRequest(
    @Param('worldId') worldId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.approveAccessRequest(worldId, requestId, user);
  }

  @Post(':worldId/access-requests/:requestId/reject')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Zamítnout žádost o vstup (delete AccessRequest)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'ACCESS_REQUEST_NOT_FOUND' })
  rejectAccessRequest(
    @Param('worldId') worldId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.rejectAccessRequest(worldId, requestId, user);
  }

  // 15.10 — world-scoped fronta „ke zpracování" (žádosti o vstup, …) pro
  // PJ/co-PJ v kontextu světa (drawer/zvoneček/stránka Hráči). Multi-typ.
  @Get(':worldId/pending-actions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Fronta ke zpracování pro daný svět (žádosti o vstup)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'WORLD_NOT_FOUND' })
  getWorldPendingActions(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.getWorldPendingActions(worldId, user);
  }

  // ── 15.10 fáze B — pozvánky do světa ──
  @Post(':id/invites')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vytvořit pozvánku do světa (cílenou / odkaz)' })
  @ApiResponse({ status: 201, description: 'OK' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({
    status: 409,
    description: 'WORLD_ALREADY_MEMBER / PENDING_INVITE',
  })
  createInvite(
    @Param('id') id: string,
    @Body() dto: CreateWorldInviteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.createInvite(id, user, dto);
  }

  @Get(':id/invites')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktivní pozvánky světa (PJ přehled)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  listInvites(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.worldsService.listInvites(id, user);
  }

  @Delete(':worldId/invites/:inviteId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Zrušit (revoke) pozvánku' })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 404, description: 'INVITE_NOT_FOUND' })
  revokeInvite(
    @Param('worldId') worldId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.revokeInvite(worldId, inviteId, user);
  }

  @Post(':worldId/invites/:inviteId/accept')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Pozvaný přijme cílenou pozvánku (→ Čtenář)' })
  @ApiResponse({ status: 201, description: 'OK' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 410, description: 'INVITE_INACTIVE' })
  acceptUserInvite(
    @Param('worldId') worldId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.acceptUserInvite(worldId, inviteId, user);
  }

  @Post(':worldId/invites/:inviteId/decline')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Pozvaný odmítne cílenou pozvánku' })
  @ApiResponse({ status: 201, description: 'OK' })
  declineUserInvite(
    @Param('worldId') worldId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.declineUserInvite(worldId, inviteId, user);
  }

  // Přijetí pozvacího ODKAZU (mimo :id kolizní zónu záměrně statickým segmentem).
  @Post('invite-token/:token/accept')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Přijmout pozvací odkaz (→ Čtenář)' })
  @ApiResponse({ status: 201, description: 'OK' })
  @ApiResponse({ status: 404, description: 'INVITE_NOT_FOUND' })
  @ApiResponse({
    status: 410,
    description: 'INVITE_INACTIVE / INVITE_EXPIRED / INVITE_EXHAUSTED',
  })
  acceptLinkInvite(
    @Param('token') token: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.acceptLinkInvite(token, user);
  }

  @Get(':id/members')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Členové světa s filtry ?role= &group=' })
  @ApiResponse({ status: 200, description: 'OK' })
  getMembers(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | null,
    @Query('role') role?: string,
    @Query('group') group?: string,
  ) {
    const filters: { role?: number; group?: string } = {};
    if (role !== undefined) {
      const roleNum = Number(role);
      if (!Number.isInteger(roleNum))
        throw new BadRequestException({
          code: 'INVALID_ROLE_VALUE',
          message: 'Neplatná hodnota role',
        });
      filters.role = roleNum;
    }
    if (group !== undefined) filters.group = group;
    return this.worldsService.getMembers(
      id,
      user,
      Object.keys(filters).length ? filters : undefined,
    );
  }

  @Delete(':worldId/members/:membershipId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Opuštění nebo odebrání člena ze světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  async leave(
    @Param('worldId') worldId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.worldsService.assertMembershipInWorld(membershipId, worldId); // N-18
    return this.worldsService.leave(membershipId, user);
  }

  @Get(':worldId/settings')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Načte nastavení světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  getSettings(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    // N-09 — member/Admin plný, nečlen jen veřejný subset, private nečlen → 404.
    return this.worldsService.getSettingsForRequester(worldId, user);
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

  // Krok 5.3d — AKJ úrovně samostatně, guard PomocnyPJ+ (na rozdíl od
  // plného PUT /settings, které je PJ-only).
  @Put(':worldId/settings/akj-types')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Uloží AKJ úrovně světa (PomocnyPJ+)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  updateAkjTypes(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateAkjTypesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateAkjTypes(worldId, dto, user);
  }

  @Patch(':worldId/calendar-defaults')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '9.2b — Změna defaultního kalendáře + timelineEpoch (PomocnyPJ+)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  updateCalendarDefaults(
    @Param('worldId') worldId: string,
    @Body() dto: PatchCalendarDefaultsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateCalendarDefaults(worldId, dto, user);
  }

  @Patch(':worldId/members/:membershipId/role')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Změna role člena ve světě' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  async updateMemberRole(
    @Param('worldId') worldId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.worldsService.assertMembershipInWorld(membershipId, worldId); // N-18
    return this.worldsService.updateMemberRole(membershipId, dto.role, user);
  }

  @Patch(':worldId/members/:membershipId/group')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Změna skupiny člena ve světě' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  async updateMemberGroup(
    @Param('worldId') worldId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.worldsService.assertMembershipInWorld(membershipId, worldId); // N-18
    return this.worldsService.updateMemberGroup(membershipId, dto.group, user);
  }

  @Patch(':worldId/members/:membershipId/character')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Přiřazení postavy členovi světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  async updateMemberCharacter(
    @Param('worldId') worldId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.worldsService.assertMembershipInWorld(membershipId, worldId); // N-18
    return this.worldsService.updateMemberCharacter(
      membershipId,
      dto.characterPath,
      user,
      dto.avatarUrl,
    );
  }

  @Patch(':worldId/members/:membershipId/akj')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace AKJ hodnoty člena' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  async updateMemberAkj(
    @Param('worldId') worldId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberAkjDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.worldsService.assertMembershipInWorld(membershipId, worldId); // N-18
    return this.worldsService.updateMemberAkj(membershipId, dto.akj, user);
  }

  @Patch(':worldId/members/:membershipId/free')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Toggle isFree flagu člena' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  async updateMemberFree(
    @Param('worldId') worldId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberFreeDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.worldsService.assertMembershipInWorld(membershipId, worldId); // N-18
    return this.worldsService.updateMemberFree(membershipId, dto.isFree, user);
  }

  // Krok 5.9 — vlastní doladění vzhledu světa (přístupnost). Člen edituje
  // jen své membership; `me` = aktuální uživatel z JWT.
  @Put(':worldId/members/me/theme')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Uloží vlastní doladění vzhledu světa (krok 5.9)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nejsi členem světa' })
  updateMyTheme(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateMemberThemeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMyTheme(worldId, dto, user);
  }

  // 6.8-followup — self-service avatar vedení. PJ/Pomocný PJ vystupuje s vlastním
  // obrázkem v režimu `individual`. Člen zapisuje jen své membership (`me` z JWT).
  @Put(':worldId/members/me/pj-avatar')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Uloží vlastní avatar vedení (6.8-followup)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Nejsi vedení světa' })
  updateMyPjAvatar(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateMemberPjAvatarDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.updateMyPjAvatar(worldId, dto.avatarUrl, user);
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
      throw new BadRequestException({
        code: 'INVALID_VERSION',
        message: 'version musí být kladné celé číslo',
      });
    }
    return this.worldsService.getDiarySchemaVersion(id, v, user);
  }

  /**
   * 8.5-BE-1 — vytvoření nové verze diary schématu (PJ+).
   * Archivuje předchozí aktivní verzi a inkrementuje `version`.
   */
  @Post(':id/diary-schema-versions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nová verze diary schématu světa (PJ+)' })
  @ApiResponse({ status: 201, description: 'Vytvořeno' })
  @ApiResponse({ status: 403, description: 'Pouze PJ+ smí měnit šablonu' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  createDiarySchemaVersion(
    @Param('id') id: string,
    @Body() dto: CreateDiarySchemaVersionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldsService.createDiarySchemaVersion(id, dto, user);
  }
}
