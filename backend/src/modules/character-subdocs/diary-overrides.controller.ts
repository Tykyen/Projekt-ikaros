import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CharacterSubdocsService } from './character-subdocs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WorldsService, type RequestUser } from '../worlds/worlds.service';
import { RemapDiaryKeysDto } from './dto/remap-diary-keys.dto';

/**
 * 8.5 D-DIARY-2 — admin akce nad diary subdokumenty celého světa (PJ+).
 * Odděleno od `CharacterSubdocsController` (`worlds/:worldId/characters/:slug`),
 * protože tento controller nezvládne route bez `:slug`.
 */
@ApiTags('Character Subdocs Admin')
@ApiBearerAuth()
@Controller('worlds/:worldId/diary-overrides')
@UseGuards(JwtAuthGuard)
export class DiaryOverridesController {
  constructor(
    private readonly subdocsService: CharacterSubdocsService,
    private readonly worldsService: WorldsService,
  ) {}

  /**
   * Bulk reset — smaže `personalDiarySchema` u všech postav světa. Použití:
   * PJ změnil schéma světa a chce, aby všechny postavy začaly používat nové.
   * Vrací počet upravených postav.
   */
  @Post('reset-all')
  @ApiOperation({
    summary: 'Smaže personalDiarySchema u všech postav světa (PJ+)',
  })
  @ApiResponse({ status: 201, description: 'OK — vrací { count }' })
  @ApiResponse({ status: 403, description: 'Pouze PJ+' })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  async resetAll(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ count: number }> {
    await this.worldsService.assertCanAdminWorld(worldId, user);
    const count = await this.subdocsService.resetAllPersonalSchemas(worldId);
    return { count };
  }

  /**
   * 8.5 D-DIARY-5 — bulk remap keys v customData přes všechny postavy světa.
   * Volá se z editoru šablony, když admin přejmenuje `key` bloku (FE detekuje
   * rename přes stabilní UUID `id`). Postavy s vlastním `personalDiarySchema`
   * se nedotknou (vlastní keyspace).
   *
   * Body: `{ mapping: { oldKey: newKey } }`.
   */
  @Post('remap')
  @ApiOperation({
    summary: 'Bulk remap keys v customData postav světa (PJ+)',
  })
  @ApiResponse({ status: 201, description: 'OK — vrací { count }' })
  @ApiResponse({ status: 403, description: 'Pouze PJ+' })
  async remapAll(
    @Param('worldId') worldId: string,
    @Body() dto: RemapDiaryKeysDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ count: number }> {
    await this.worldsService.assertCanAdminWorld(worldId, user);
    const count = await this.subdocsService.remapAllKeysByWorld(
      worldId,
      dto.mapping,
    );
    return { count };
  }
}
