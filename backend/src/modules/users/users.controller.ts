import {
  Controller,
  Get,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from './interfaces/user.interface';

type Requester = { id: string; role: UserRole };

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vlastní profil přihlášeného uživatele' })
  @ApiResponse({ status: 200, description: 'Profil uživatele' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  getMe(@CurrentUser() user: Requester) {
    return this.usersService.findById(user.id);
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
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
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
      throw new ForbiddenException('Nedostatečná oprávnění');
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

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Detail uživatele podle ID' })
  @ApiResponse({ status: 200, description: 'Data uživatele' })
  @ApiResponse({ status: 401, description: 'Neautorizováno' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  findOne(@Param('id') id: string, @CurrentUser() requester: Requester) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
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
      throw new ForbiddenException('Nedostatečná oprávnění');
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
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    if (dto.username !== undefined && requester.role !== UserRole.Superadmin) {
      throw new ForbiddenException(
        'Změnu username může provést jen Superadmin',
      );
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
      throw new ForbiddenException('Reset hesla může provést jen Superadmin');
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
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return this.usersService.delete(id);
  }
}
