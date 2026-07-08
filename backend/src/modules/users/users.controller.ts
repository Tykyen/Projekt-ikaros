import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UploadService } from '../upload/upload.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { RequestUsernameChangeDto } from './dto/request-username-change.dto';
import { RequestSelfDeletionDto } from './dto/request-self-deletion.dto';
import { UpdateFavoriteCharactersDto } from './dto/update-favorite-characters.dto';
import { UpdateFavoritePagesDto } from './dto/update-favorite-pages.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowPendingDeletion } from '../../common/decorators/allow-pending-deletion.decorator';
import { UserRole } from './interfaces/user.interface';

type Requester = { id: string; role: UserRole };

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadService: UploadService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vlastní profil přihlášeného uživatele' })
  @ApiResponse({ status: 200, description: 'Profil uživatele' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  getMe(@CurrentUser() user: Requester) {
    return this.usersService.findById(user.id);
  }

  // 1.3a — `me` musí být DEKLAROVÁNO PŘED `@Patch(':id')`, jinak by route
  // `me` spadla do parametrické `:id` (NestJS matchuje v pořadí deklarace).
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace vlastního profilu' })
  @ApiResponse({ status: 200, description: 'Profil aktualizován' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  updateMe(@Body() dto: UpdateUserDto, @CurrentUser() user: Requester) {
    // Změna username jde přes dedikovaný request-flow (1.3b), ne přes /me.
    if (dto.username !== undefined) {
      throw new ForbiddenException({
        code: 'USERNAME_CHANGE_VIA_REQUEST',
        message: 'Změna username probíhá přes žádost, ne přes úpravu profilu',
      });
    }
    return this.usersService.update(user.id, dto);
  }

  // 15.9 — notifikační preference. PŘED `@Patch(':id')` (NestJS matchuje
  // v pořadí deklarace; jinak by `me/...` spadlo do parametrické `:id`).
  @Patch('me/notification-preferences')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace notifikačních preferencí (merge)' })
  @ApiResponse({ status: 200, description: 'Preference aktualizovány' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  updateNotificationPreferences(
    @Body() dto: UpdateNotificationPreferencesDto,
    @CurrentUser() user: Requester,
  ) {
    return this.usersService.updateNotificationPreferences(user.id, dto);
  }

  // ── 1.3a — avatar uživatele / postavy ──────────────────────────────

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Nahrání vlastního avataru' })
  async uploadAvatar(
    @CurrentUser() user: Requester,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException({
        code: 'NO_FILE',
        message: 'Soubor chybí',
      });
    const { url } = await this.uploadService.uploadUserImage(
      file,
      `ikaros/users/${user.id}/avatar`,
      512,
    );
    return this.usersService.update(user.id, { avatarUrl: url });
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Odebrání vlastního avataru' })
  async deleteAvatar(@CurrentUser() user: Requester) {
    await this.uploadService.deleteUserImage(`ikaros/users/${user.id}/avatar`);
    return this.usersService.update(user.id, { avatarUrl: '' });
  }

  @Post('me/character/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Nahrání avataru postavy' })
  async uploadCharacterAvatar(
    @CurrentUser() user: Requester,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException({
        code: 'NO_FILE',
        message: 'Soubor chybí',
      });
    const { url } = await this.uploadService.uploadUserImage(
      file,
      `ikaros/users/${user.id}/character`,
      256,
    );
    return this.usersService.update(user.id, { characterAvatarUrl: url });
  }

  @Delete('me/character/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Odebrání avataru postavy' })
  async deleteCharacterAvatar(@CurrentUser() user: Requester) {
    await this.uploadService.deleteUserImage(
      `ikaros/users/${user.id}/character`,
    );
    return this.usersService.update(user.id, { characterAvatarUrl: '' });
  }

  // ── 8.3 / D-074 — Oblíbené postavy per svět ─────────────────────────

  @Put('me/favorite-characters/:worldId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Replace per-svět seznam oblíbených postav přihlášeného uživatele',
  })
  @ApiResponse({
    status: 200,
    description: '{ favoriteCharacters: Record<worldId, slug[]> }',
  })
  async setFavoriteCharacters(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateFavoriteCharactersDto,
    @CurrentUser() user: Requester,
  ) {
    const favoriteCharacters = await this.usersService.setFavoriteCharacters(
      user.id,
      worldId,
      dto.slugs,
    );
    return { favoriteCharacters };
  }

  // ── 5.2-followup — Osobní oblíbené STRÁNKY per svět ─────────────────

  @Put('me/favorite-pages/:worldId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Replace per-svět seznam oblíbených stránek přihlášeného uživatele',
  })
  @ApiResponse({
    status: 200,
    description: '{ favoritePageSlugs: Record<worldId, slug[]> }',
  })
  async setFavoritePages(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateFavoritePagesDto,
    @CurrentUser() user: Requester,
  ) {
    const favoritePageSlugs = await this.usersService.setFavoritePages(
      user.id,
      worldId,
      dto.slugs,
    );
    return { favoritePageSlugs };
  }

  // ── 8.3 / D-075 — Cross-world přehled „mých postav" ─────────────────

  @Get('me/characters')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Cross-world přehled mých postav (membership.characterPath joined s Character + World)',
  })
  @ApiResponse({ status: 200, description: 'MyCharacterEntry[]' })
  getMyCharacters(@CurrentUser() user: Requester) {
    return this.usersService.getMyCharacters(user.id);
  }

  // ── SP3 — Spec 1.4 ─────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Paginated public user list (spec 1.4)' })
  listPublic(
    @CurrentUser() requester: Requester,
    @Query('q') q?: string,
    @Query('sort') sort?: 'new' | 'recent' | 'username',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.usersService.listPublic(
      {
        q,
        sort,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        includeDeleted: includeDeleted === 'true',
      },
      requester.role,
    );
  }

  @Get('profile/v14/:id')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'PublicUserProfile (spec 1.4 v14 shape)' })
  publicProfileV14(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
  ) {
    return this.usersService.publicProfileV14(id, requester.id, requester.role);
  }

  // ── SP3 — Spec 1.7 ─────────────────────────────────────────────────

  @Post('me/request-email-change')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Žádost o změnu emailu — vystaví token + 2 maily',
  })
  requestEmailChange(
    @CurrentUser() requester: Requester,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.usersService.requestEmailChange(requester.id, dto);
  }

  // ── 1.3b (N-6b) — žádost o změnu username (base CRUD) ──────────────────

  @Post('me/username-request')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '1.3b — vytvoří pending žádost o změnu username (admin schválí)',
  })
  @ApiResponse({ status: 201, description: '{ request: ... }' })
  @ApiResponse({
    status: 409,
    description:
      'SAME_USERNAME / COOLDOWN_ACTIVE / USERNAME_TAKEN / REQUEST_EXISTS',
  })
  requestUsernameChange(
    @CurrentUser() requester: Requester,
    @Body() dto: RequestUsernameChangeDto,
  ) {
    return this.usersService.requestUsernameChange(
      requester.id,
      dto.newUsername,
    );
  }

  @Get('me/username-request')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '1.3b — aktuální pending username žádost, nebo null',
  })
  @ApiResponse({ status: 200, description: '{ request: ... | null }' })
  getUsernameRequest(@CurrentUser() requester: Requester) {
    return this.usersService.getPendingUsernameRequest(requester.id);
  }

  @Delete('me/username-request')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '1.3b — zruší vlastní pending username žádost' })
  @ApiResponse({ status: 204, description: 'Zrušeno' })
  cancelUsernameRequest(@CurrentUser() requester: Requester) {
    return this.usersService.cancelUsernameRequest(requester.id);
  }

  // ── 1.3c (N-6b) — self-delete účtu (30denní hold) ──────────────────────

  @Post('me/deletion-request')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '1.3c — žádost o smazání účtu (30denní hold); ?dryRun=preview',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({
    status: 400,
    description: 'USERNAME_MISMATCH / SOLE_PJ_BLOCK',
  })
  @ApiResponse({
    status: 409,
    description: 'ALREADY_DELETED / ALREADY_PENDING_DELETION',
  })
  requestSelfDeletion(
    @CurrentUser() requester: Requester,
    @Body() dto: RequestSelfDeletionDto,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.usersService.requestSelfDeletion(
      requester.id,
      dto.confirmUsername,
      dryRun === 'true',
    );
  }

  @Get('me/deletion-request')
  @UseGuards(JwtAuthGuard)
  @AllowPendingDeletion()
  @ApiOperation({ summary: '1.3c — stav self-delete žádosti, nebo null' })
  @ApiResponse({ status: 200 })
  getSelfDeletionStatus(@CurrentUser() requester: Requester) {
    return this.usersService.getSelfDeletionStatus(requester.id);
  }

  @Delete('me/deletion-request')
  @UseGuards(JwtAuthGuard)
  @AllowPendingDeletion()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '1.3c — zruší vlastní pending self-delete' })
  @ApiResponse({ status: 204, description: 'Zrušeno' })
  cancelSelfDeletion(@CurrentUser() requester: Requester) {
    return this.usersService.cancelSelfDeletion(requester.id);
  }

  // ── D-028 — toast po loginu o rozhodnuté username žádosti ──────────────

  @Get('me/username-request/last-unseen-decided')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'D-028 — poslední rozhodnutá username žádost, kterou žadatel neviděl',
  })
  @ApiResponse({ status: 200, description: '{ request: ... | null }' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  lastUnseenDecidedRequest(@CurrentUser() requester: Requester) {
    return this.usersService.getLastUnseenDecidedRequest(requester.id);
  }

  @Post('me/username-request/:id/seen')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'D-028 — označí username žádost za zhlédnutou' })
  @ApiResponse({ status: 204, description: 'Označeno' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({ status: 404, description: 'Žádost neexistuje' })
  markUsernameRequestSeen(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
  ) {
    return this.usersService.markUsernameRequestSeen(requester.id, id);
  }

  // Bezpečnost (2026-06-18): odstraněna nechráněná routa `GET profile/:id`.
  // Obcházela friend-only viditelnost i tombstone gate a bez auth/rate-limitu
  // šla hromadně scrapovat. Veřejný profil jde výhradně přes `profile/v14/:id`
  // (JwtAuthGuard + gating). Servisní metoda `usersService.publicProfile`
  // zůstává pro interní enrichment (worlds/friendships).

  @Get('getCalendarMonth/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Načte calendarMonth z themeSettings' })
  @ApiResponse({ status: 200, description: 'Hodnota calendarMonth' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  async getCalendarMonth(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException({
        code: 'USER_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const user = await this.usersService.findById(id);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    return {
      calendarMonth: user.themeSettings?.calendarMonth ?? null,
    };
  }

  @Put('updateCalendarMonth/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Uloží calendarMonth do themeSettings' })
  @ApiResponse({ status: 200, description: 'Aktualizováno' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  updateCalendarMonth(
    @Param('id') id: string,
    @Body() body: { calendarMonth: unknown },
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException({
        code: 'USER_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    return this.usersService.update(id, {
      themeSettings: { calendarMonth: body.calendarMonth },
    });
  }

  @Get('exists/:username')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Anon — kontrola existence usernamu pro registraci',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'Username je příliš dlouhé' })
  exists(@Param('username') username: string) {
    return this.usersService.exists(username);
  }

  @Get('lookup')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Lookup uživatelů pro pickery (spec 3.4)' })
  @ApiResponse({ status: 200 })
  lookup(@Query('q') q?: string) {
    return this.usersService.lookup(q ?? '');
  }

  // 19.4 — veřejná zeď podporovatelů. BEZ guardu (marketing i pro anon).
  // MUSÍ být deklarováno PŘED @Get(':id'), jinak by ':id'='supporters'.
  @Get('supporters')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: '19.4 — veřejná zeď podporovatelů (leak-safe)' })
  @ApiResponse({ status: 200 })
  listSupporters() {
    return this.usersService.listSupporters();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Detail uživatele podle ID' })
  @ApiResponse({ status: 200, description: 'Data uživatele' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  findOne(@Param('id') id: string, @CurrentUser() requester: Requester) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException({
        code: 'USER_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    return this.usersService.findById(id);
  }

  @Put(':id/theme')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace themeSettings (merge)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  updateTheme(
    @Param('id') id: string,
    @Body() dto: UpdateThemeDto,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException({
        code: 'USER_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    return this.usersService.updateTheme(id, dto.themeSettings);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace vlastního profilu' })
  @ApiResponse({ status: 200, description: 'Profil aktualizován' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException({
        code: 'USER_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    if (dto.username !== undefined && requester.role !== UserRole.Superadmin) {
      throw new ForbiddenException({
        code: 'USERNAME_CHANGE_REQUIRES_SUPERADMIN',
        message: 'Změnu username může provést jen Superadmin',
      });
    }
    return this.usersService.update(id, dto);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Změna vlastního hesla' })
  @ApiResponse({ status: 204, description: 'Heslo změněno' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() requester: Requester,
  ) {
    return this.usersService.changePassword(requester.id, dto);
  }

  @Put(':id/reset-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Reset hesla uživatele (Superadmin)' })
  @ApiResponse({ status: 204, description: 'Heslo resetováno' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({
    status: 403,
    description: 'Nedostatečná oprávnění — pouze Superadmin',
  })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  resetPassword(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
    @Body() dto: ResetPasswordDto,
  ) {
    if (requester.role !== UserRole.Superadmin) {
      throw new ForbiddenException({
        code: 'PASSWORD_RESET_REQUIRES_SUPERADMIN',
        message: 'Reset hesla může provést jen Superadmin',
      });
    }
    return this.usersService.resetPassword(id, dto);
  }
}
