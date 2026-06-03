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
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
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

  @Post('reactivate-deletion')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '1.3c — reaktivace účtu v pending self-delete (credentials + login)',
  })
  @ApiResponse({ status: 200, description: 'Tokeny + user (reaktivováno)' })
  @ApiResponse({ status: 400, description: 'NOT_PENDING_DELETION' })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS / DELETED' })
  reactivateDeletion(@Body() dto: LoginDto) {
    return this.authService.reactivateDeletion(dto);
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

  // ── SP2 — Email flows ──────────────────────────────────────────────

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Žádost o reset hesla — anti-enumeration, vždy { ok: true }',
  })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset hesla přes token + D-037 reaktivace' })
  @ApiResponse({
    status: 200,
    description: '{ ok: true, deletionReactivated?, revertablePromotions? }',
  })
  @ApiResponse({
    status: 400,
    description: 'INVALID/EXPIRED/ALREADY_USED token',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPasswordByToken(dto.token, dto.password);
  }

  @Post('verify-email')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifikace emailu přes one-time token' })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  @ApiResponse({
    status: 400,
    description: 'INVALID/EXPIRED/ALREADY_USED token',
  })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verify email pro přihlášeného usera' })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  @ApiResponse({ status: 400, description: 'ALREADY_VERIFIED' })
  @ApiResponse({ status: 401, description: 'Bez JWT nebo user neexistuje' })
  resendVerification(@CurrentUser() user: RequestUser) {
    return this.authService.resendEmailVerification(user.id);
  }

  @Post('confirm-email-change')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Potvrzení změny emailu přes token' })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  @ApiResponse({ status: 400, description: 'INVALID token nebo meta chybí' })
  @ApiResponse({ status: 409, description: 'EMAIL_TAKEN (race)' })
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.authService.confirmEmailChange(dto.token);
  }
}
