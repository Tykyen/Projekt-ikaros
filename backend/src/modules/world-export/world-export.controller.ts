import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { WorldExportService } from './world-export.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('WorldExport')
@ApiBearerAuth()
@Controller('worlds/:worldId/export')
@UseGuards(JwtAuthGuard)
export class WorldExportController {
  constructor(private readonly service: WorldExportService) {}

  @Get()
  @ApiOperation({
    summary: '14.7c — záloha celého světa (ZIP: manifest + data.json + média)',
  })
  @ApiResponse({ status: 200, description: 'ZIP stream' })
  @ApiResponse({
    status: 403,
    description: 'Bez oprávnění / hráčský export zatím nedostupný',
  })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  async export(
    @Param('worldId') worldId: string,
    @Query('chat') chat: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.service.streamExport(worldId, user, { chat: chat === '1' }, res);
  }
}
