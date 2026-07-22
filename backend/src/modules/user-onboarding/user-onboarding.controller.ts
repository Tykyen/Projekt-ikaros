import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import {
  OnboardingEntity,
  UserOnboardingService,
} from './user-onboarding.service';
import { PatchOnboardingDto } from './dto/patch-onboarding.dto';

/** Spec 26.3 (D6) — stav Vypravěče per uživatel; jen vlastník (me). */
@ApiTags('UserOnboarding')
@Controller('users/me/onboarding')
@UseGuards(JwtAuthGuard)
export class UserOnboardingController {
  constructor(private readonly service: UserOnboardingService) {}

  @Get()
  @ApiOperation({
    summary: 'Stav Vypravěče + legacy flag (backfill seed provádí FE)',
  })
  async get(
    @CurrentUser() user: RequestUser,
  ): Promise<{ state: OnboardingEntity | null; legacy: boolean }> {
    return this.service.get(user.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Delta merge stavu (set-union pole, $min časy, LWW skaláry)',
  })
  async patch(
    @CurrentUser() user: RequestUser,
    @Body() dto: PatchOnboardingDto,
  ): Promise<OnboardingEntity> {
    return this.service.patch(user.id, dto);
  }
}
