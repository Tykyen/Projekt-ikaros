import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorldOperationsService } from './operations/world-operations.service';
import { OperationsAuthorizer } from './operations/operations-authorizer.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';

interface RequestUser {
  id: string;
  role: UserRole;
  // world elevation — admin bypass jen pro elevované světy (worldAdminBypass).
  elevatedWorldIds?: string[];
}

/**
 * 10.2-prep-1 — controller pro cross-scene operations (`worldOperations`).
 *
 * Žije v MapsModule (vše operations infra zde), ale endpoint cesta je `/worlds/...`
 * pro logickou koherenci. NestJS umožňuje dva controllery se stejným prefixem
 * v různých modulech, pokud cesty nemají kolizi.
 *
 * Spec: docs/arch/maps/operations/api.md § Apply World Operation, Get World Operations.
 */
@ApiTags('WorldOperations')
@ApiBearerAuth()
@Controller('worlds')
export class WorldOperationsController {
  constructor(
    private readonly worldOps: WorldOperationsService,
    private readonly authorizer: OperationsAuthorizer,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
  ) {}

  @ApiOperation({
    summary:
      '10.2-prep-1 — aplikace cross-scene operace (member.assignToScene/.unassign/.bulkAssign)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400, description: 'MAP_OP_INVALID' })
  @ApiResponse({
    status: 403,
    description: 'MAP_OP_FORBIDDEN (PJ-only kromě self-unassign)',
  })
  @ApiResponse({
    status: 404,
    description: 'MAP_SCENE_NOT_FOUND / MAP_MEMBER_NOT_FOUND',
  })
  @ApiResponse({ status: 409, description: 'MAP_MEMBER_NOT_IN_WORLD' })
  @Post(':worldId/operations')
  @UseGuards(JwtAuthGuard)
  async applyOperation(
    @Param('worldId') worldId: string,
    @Body() op: unknown,
    @CurrentUser() user: RequestUser,
  ) {
    return this.worldOps.apply(worldId, op, user);
  }

  @ApiOperation({
    summary:
      '10.2-prep-1 — catch-up cross-scene ops (PJ orchestrator panel, PJ-only)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({
    status: 403,
    description: 'MAP_FORBIDDEN — cross-scene privacy (hráč nečte)',
  })
  @ApiResponse({ status: 404 })
  @Get(':worldId/operations')
  @UseGuards(JwtAuthGuard)
  async getOperationsSince(
    @Param('worldId') worldId: string,
    @Query('since') sinceStr: string = '0',
    @Query('limit') limitStr: string = '200',
    @CurrentUser() user: RequestUser,
  ) {
    await this.authorizer.assertCanReadWorldLog(user, worldId);
    const world = await this.worldsRepo.findById(worldId);
    if (!world) {
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    }
    const since = parseInt(sinceStr, 10) || 0;
    const limit = Math.min(parseInt(limitStr, 10) || 200, 500);
    const operations = await this.worldOps.findSince(worldId, since, limit);
    return {
      worldId,
      lastSeqNumber:
        (world as unknown as { lastSeqNumber?: number }).lastSeqNumber ?? 0,
      operations,
    };
  }
}
