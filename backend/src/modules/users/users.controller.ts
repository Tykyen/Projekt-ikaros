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
import { UpdateFavoriteCharactersDto } from './dto/update-favorite-characters.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

  @Get('profile/:id')
  @ApiOperation({ summary: 'Veřejný profil uživatele' })
  @ApiResponse({ status: 200, description: 'Veřejný profil' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  publicProfile(@Param('id') id: string) {
    return this.usersService.publicProfile(id);
  }

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

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání účtu' })
  @ApiResponse({ status: 204, description: 'Účet smazán' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  delete(@Param('id') id: string, @CurrentUser() requester: Requester) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException({
        code: 'USER_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    return this.usersService.delete(id);
  }
}
