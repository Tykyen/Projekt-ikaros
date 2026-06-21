import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MapsService } from './maps.service';
import { MapOperationsService } from './operations/map-operations.service';
import { OperationsAuthorizer } from './operations/operations-authorizer.service';
import type { IMapsRepository } from './interfaces/maps-repository.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateMapDto } from './dto/create-map.dto';
import { MoveTokenDto } from './dto/move-token.dto';
import { RemoveTokenDto } from './dto/remove-token.dto';

interface RequestUser {
  id: string;
  role: UserRole;
  // world elevation — admin bypass jen pro elevované světy (worldAdminBypass).
  elevatedWorldIds?: string[];
}

@ApiTags('Maps')
@ApiBearerAuth()
@Controller('maps')
export class MapsController {
  constructor(
    private readonly service: MapsService,
    // 10.2-prep-1 — operations endpoints
    private readonly mapOps: MapOperationsService,
    private readonly authorizer: OperationsAuthorizer,
    @Inject('IMapsRepository')
    private readonly mapsRepo: IMapsRepository,
  ) {}

  @ApiOperation({
    summary:
      'Scény světa (volitelně filter ?isActive=true pro PJ orchestrator)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'MAP_FORBIDDEN (PomocnyPJ+)' })
  @Get()
  @UseGuards(JwtAuthGuard)
  findByWorld(
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
    @Query('isActive') isActive?: string,
  ) {
    // R-11 — dřív BEZ guardu → anonymní dump celé taktické mapy (HP/fog/pozice).
    // Teď JWT + staff (PomocnyPJ+) — orchestrator read. Per-hráč scéna jde přes
    // `GET /maps/active` (membership.currentSceneId).
    if (isActive === 'true')
      return this.service.findActiveScenes(worldId, user);
    return this.service.findByWorld(worldId, user);
  }

  @ApiOperation({
    summary:
      '10.2-prep-1 — aktuální scéna PRO TOHOTO uživatele (per WorldMembership.currentSceneId)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'MAP_NO_ACTIVE_SCENE' })
  @Get('active')
  @UseGuards(JwtAuthGuard)
  findActive(
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.findActiveForUser(worldId, user.id);
  }

  @ApiOperation({ summary: 'Detail scény s characterData enrichmentem' })
  @ApiResponse({ status: 200 })
  @ApiResponse({
    status: 403,
    description: 'MAP_FORBIDDEN_OTHER_SCENE — hráč nemá scénu přiřazenou',
  })
  @ApiResponse({ status: 404 })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    // 10.2c-edit-1 — bez guardu hráč mohl GETnout libovolnou scénu přes ID.
    // Nejdřív načteme přes repo (kvůli auth checku); enriched verze následuje
    // až po assert.
    const scene = await this.mapsRepo.findById(id);
    if (!scene) {
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
    }
    await this.authorizer.assertCanReadScene(user, scene);
    return this.service.findById(id);
  }

  @ApiOperation({ summary: 'Vytvoření scény (PJ/Admin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateMapDto, @CurrentUser() user: RequestUser) {
    const worldId = dto.worldId ?? '';
    await this.service.assertCanManage(user, worldId);
    return this.service.create(
      dto as unknown as Partial<
        import('./interfaces/map-scene.interface').MapScene
      >,
      worldId,
    );
  }

  @ApiOperation({ summary: 'Aktivace scény (deaktivuje ostatní v světě)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @Post(':id/active')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async setActive(
    @Param('id') id: string,
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    await this.service.setActive(id, worldId);
  }

  @ApiOperation({ summary: 'Aktualizace scény' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async replace(
    @Param('id') id: string,
    @Body() dto: CreateMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    const worldId = dto.worldId ?? '';
    await this.service.assertCanManage(user, worldId);
    return this.service.replace(
      id,
      dto as unknown as Partial<
        import('./interfaces/map-scene.interface').MapScene
      >,
    );
  }

  @ApiOperation({
    summary:
      'DEPRECATED — použij POST /maps/:id/operations s op.type=token.move',
    deprecated: true,
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @Patch(':id/move-token')
  @UseGuards(JwtAuthGuard)
  moveToken(
    @Param('id') sceneId: string,
    @Body() dto: MoveTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.moveToken(sceneId, dto, user);
  }

  @ApiOperation({
    summary:
      'DEPRECATED — použij POST /maps/:id/operations s op.type=token.remove',
    deprecated: true,
  })
  @ApiResponse({ status: 204, description: 'Token odebrán' })
  @ApiResponse({ status: 403 })
  @Patch(':id/remove-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async removeToken(
    @Param('id') sceneId: string,
    @Body() dto: RemoveTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.removeToken(sceneId, dto.tokenId, user);
  }

  // 10.2-prep-1 — Operations API
  // ─────────────────────────────────────────────────────────────────────
  @ApiOperation({
    summary: '10.2-prep-1 — aplikace per-scene operace (token/effect/fog/...)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400, description: 'MAP_OP_INVALID' })
  @ApiResponse({ status: 403, description: 'MAP_OP_FORBIDDEN' })
  @ApiResponse({
    status: 404,
    description: 'MAP_SCENE_NOT_FOUND / token / effect',
  })
  @Post(':id/operations')
  @UseGuards(JwtAuthGuard)
  async applyOperation(
    @Param('id') sceneId: string,
    @Body() op: unknown,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mapOps.apply(sceneId, op, user);
  }

  @ApiOperation({
    summary: '10.2-prep-1 — catch-up operace od seqNumber (per-scene log)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({
    status: 403,
    description: 'MAP_FORBIDDEN — inter-scene privacy',
  })
  @ApiResponse({ status: 404 })
  @Get(':id/operations')
  @UseGuards(JwtAuthGuard)
  async getOperationsSince(
    @Param('id') sceneId: string,
    @Query('since') sinceStr: string = '0',
    @Query('limit') limitStr: string = '500',
    @CurrentUser() user: RequestUser,
  ) {
    // Load scene bez enrichTokens (jen pro auth check + lastSeqNumber)
    const scene = await this.mapsRepo.findById(sceneId);
    if (!scene) {
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
    }
    await this.authorizer.assertCanReadSceneLog(user, scene);
    const since = parseInt(sinceStr, 10) || 0;
    const limit = Math.min(parseInt(limitStr, 10) || 500, 1000);
    const operations = await this.mapOps.findSince(sceneId, since, limit);
    return {
      sceneId,
      lastSeqNumber: scene.lastSeqNumber ?? 0,
      operations,
    };
  }
  // ─────────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Smazání scény (PJ/Admin)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user, worldId);
    await this.service.deleteScene(id);
  }
}
