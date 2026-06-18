import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
  setTrustCookie,
  readTrustCookie,
} from '../../common/utils/auth-cookie';
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
import { LoginTotpDto } from './dto/login-totp.dto';
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
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    setRefreshCookie(res, result.refreshToken); // PC-18
    return result;
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Přihlášení — vrátí accessToken + refreshToken' })
  @ApiResponse({ status: 200, description: 'Tokeny + user' })
  @ApiResponse({ status: 401, description: 'Nesprávné přihlašovací údaje' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, readTrustCookie(req));
    // PC-18: union — refresh token jen v "ok" případě (ne deletion_pending /
    // totp_required — tam se token vydá až po /auth/login/totp).
    if ('refreshToken' in result && result.refreshToken) {
      setRefreshCookie(res, result.refreshToken);
    }
    return result;
  }

  @Post('login/totp')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '14.1 — dokončení loginu druhým faktorem (TOTP / záložní kód)',
  })
  @ApiResponse({ status: 200, description: 'Tokeny + user' })
  @ApiResponse({
    status: 401,
    description: 'TOTP_INVALID_CODE / neplatný challenge',
  })
  async loginTotp(
    @Body() dto: LoginTotpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, newTrustToken } = await this.authService.loginTotp(
      dto,
      req.headers['user-agent'],
    );
    if ('refreshToken' in result && result.refreshToken) {
      setRefreshCookie(res, result.refreshToken);
    }
    if (newTrustToken) {
      setTrustCookie(res, newTrustToken); // 14.1 — důvěryhodné zařízení
    }
    return result;
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
  async reactivateDeletion(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.reactivateDeletion(dto);
    if ('refreshToken' in result && result.refreshToken) {
      setRefreshCookie(res, result.refreshToken); // PC-18
    }
    return result;
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
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // PC-18: cookie má přednost; body je fallback (staří klienti / přechod).
    const token = readRefreshCookie(req) ?? dto.refreshToken;
    if (!token) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Chybí refresh token',
      });
    }
    const result = await this.authService.refresh(token);
    setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Odhlášení dané relace (rodina tokenů). Idempotentní.',
  })
  @ApiResponse({ status: 204, description: 'OK (i pro neplatný token)' })
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = readRefreshCookie(req) ?? dto.refreshToken;
    if (token) await this.authService.logout(token);
    clearRefreshCookie(res); // PC-18
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Odhlášení všech relací uživatele (forced logout)' })
  @ApiResponse({ status: 204, description: 'OK' })
  @ApiResponse({ status: 401, description: 'Bez JWT' })
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.id);
    clearRefreshCookie(res); // PC-18
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
