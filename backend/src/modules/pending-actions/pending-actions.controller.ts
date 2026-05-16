import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminPermissions, UserRole } from '../users/interfaces/user.interface';
import { PendingActionsService } from './pending-actions.service';
import { PendingActionType } from './pending-action-type.enum';

type Requester = {
  id: string;
  role: UserRole;
  adminPermissions?: AdminPermissions;
};

@ApiTags('PendingActions')
@ApiBearerAuth()
@Controller('pending-actions')
@UseGuards(JwtAuthGuard)
export class PendingActionsController {
  constructor(private readonly service: PendingActionsService) {}

  @Get('count')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({
    summary:
      'Spec 1.4 + 3.8 — Suma pending akcí pro current usera napříč všemi queue typy (Zpracovat tab badge) + byType rozpad pro per-doména nav badge.',
  })
  @ApiResponse({
    status: 200,
    description: '{ total: number, byType: Record<PendingActionType, number> }',
  })
  async getCount(@CurrentUser() requester: Requester): Promise<{
    total: number;
    byType: Partial<Record<PendingActionType, number>>;
  }> {
    return this.service.countForUser(
      requester.id,
      requester.role,
      requester.adminPermissions,
    );
  }

  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary:
      'Spec 1.4 — Pending položky daného typu pro current usera (Zpracovat tab sub-sekce).',
  })
  @ApiResponse({ status: 200, description: '{ items: [], total: number }' })
  async list(
    @Query('type') typeRaw: string,
    @CurrentUser() requester: Requester,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<{ items: unknown[]; total: number }> {
    const type = this.parseType(typeRaw);
    const cappedLimit = Math.min(Math.max(limit, 1), 60);
    const safePage = Math.max(page, 1);
    return this.service.listForType(
      type,
      requester.id,
      requester.role,
      safePage,
      cappedLimit,
      requester.adminPermissions,
    );
  }

  private parseType(raw: string): PendingActionType {
    const allowed = Object.values(PendingActionType);
    if (!raw || !allowed.includes(raw as PendingActionType)) {
      throw new BadRequestException(
        `Neplatný 'type' parametr. Povolené: ${allowed.join(', ')}`,
      );
    }
    return raw as PendingActionType;
  }
}
