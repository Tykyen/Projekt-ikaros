import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Registrace nového uživatele' })
  @ApiResponse({
    status: 201,
    description: 'Uživatel vytvořen, vrací accessToken + refreshToken',
  })
  @ApiResponse({
    status: 400,
    description: 'Validační chyba nebo username již existuje',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Přihlášení — vrátí accessToken + refreshToken' })
  @ApiResponse({ status: 200, description: 'Tokeny + user' })
  @ApiResponse({ status: 401, description: 'Nesprávné přihlašovací údaje' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('check-username')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Zda je přezdívka dostupná pro registraci (public)',
  })
  @ApiQuery({ name: 'u', required: true, description: 'Kandidát na username' })
  @ApiResponse({ status: 200, description: '{ available: boolean }' })
  checkUsername(@Query('u') username: string): Promise<{ available: boolean }> {
    return this.authService.checkUsername(username ?? '');
  }

  @Get('check-email')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Zda je e-mail dostupný pro registraci (public)' })
  @ApiQuery({ name: 'e', required: true, description: 'Kandidát na e-mail' })
  @ApiResponse({ status: 200, description: '{ available: boolean }' })
  checkEmail(@Query('e') email: string): Promise<{ available: boolean }> {
    return this.authService.checkEmail(email ?? '');
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotace refresh tokenu — vrátí nový pár tokenů' })
  @ApiResponse({ status: 200, description: 'Nový accessToken + refreshToken' })
  @ApiResponse({
    status: 401,
    description: 'Token invalid, expired, nebo zneužit (rodina zrušena)',
  })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Odhlášení dané relace (rodina tokenů). Idempotentní.',
  })
  @ApiResponse({ status: 204, description: 'OK (i pro neplatný token)' })
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Odhlášení všech relací uživatele (forced logout)' })
  @ApiResponse({ status: 204, description: 'OK' })
  @ApiResponse({ status: 401, description: 'Bez JWT' })
  async logoutAll(@CurrentUser() user: RequestUser): Promise<void> {
    await this.authService.logoutAll(user.id);
  }
}
