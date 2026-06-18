import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { readTrustCookie } from '../../common/utils/auth-cookie';
import { TotpService } from './services/totp.service';
import { TrustedDevicesService } from '../trusted-devices/trusted-devices.service';
import { EnableTotpDto } from './dto/enable-totp.dto';
import { PasswordConfirmDto } from './dto/password-confirm.dto';

/** 14.1 — správa 2FA pro přihlášeného uživatele (vše vyžaduje plný JWT). */
@ApiTags('Auth 2FA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Throttle({ default: { ttl: 60_000, limit: 15 } })
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly totp: TotpService,
    private readonly trustedDevices: TrustedDevicesService,
  ) {}

  @Post('setup')
  @ApiOperation({ summary: '14.1 — vygeneruj TOTP secret + QR (pending)' })
  setup(@CurrentUser() user: RequestUser) {
    return this.totp.setup(user.id);
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '14.1 — ověř kód, aktivuj 2FA, vrať záložní kódy' })
  enable(@CurrentUser() user: RequestUser, @Body() dto: EnableTotpDto) {
    return this.totp.enable(user.id, dto.code);
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '14.1 — vypni 2FA (re-auth heslem)' })
  disable(@CurrentUser() user: RequestUser, @Body() dto: PasswordConfirmDto) {
    return this.totp.disable(user.id, dto.password);
  }

  @Post('backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '14.1 — nové záložní kódy (re-auth heslem)' })
  regenerate(
    @CurrentUser() user: RequestUser,
    @Body() dto: PasswordConfirmDto,
  ) {
    return this.totp.regenerateBackupCodes(user.id, dto.password);
  }

  @Get('trusted-devices')
  @ApiOperation({ summary: '14.1 — výpis důvěryhodných zařízení' })
  listTrustedDevices(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.trustedDevices.list(user.id, readTrustCookie(req));
  }

  @Delete('trusted-devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '14.1 — odvolat jedno důvěryhodné zařízení' })
  async revokeTrustedDevice(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.trustedDevices.revoke(user.id, id);
  }

  @Delete('trusted-devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '14.1 — odvolat všechna důvěryhodná zařízení' })
  async revokeAllTrustedDevices(
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.trustedDevices.revokeAllForUser(user.id);
  }
}
