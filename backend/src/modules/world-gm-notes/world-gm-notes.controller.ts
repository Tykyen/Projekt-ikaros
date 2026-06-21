import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorldGmNotesService } from './world-gm-notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { UpdateWorldGmNotesDto } from './dto/update-world-gm-notes.dto';

@ApiTags('WorldGmNotes')
@ApiBearerAuth()
@Controller('worlds/:worldId/gm-notes')
@UseGuards(JwtAuthGuard)
export class WorldGmNotesController {
  constructor(private readonly service: WorldGmNotesService) {}

  @Get()
  @ApiOperation({ summary: 'PJ poznámkový blok pro tento svět (per-PJ)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Bez PJ práv' })
  getNotes(
    @CurrentUser() user: RequestUser,
    @Param('worldId') worldId: string,
  ) {
    return this.service.getNotes(user, worldId);
  }

  @Patch()
  @ApiOperation({ summary: 'Uložení PJ poznámek' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Bez PJ práv' })
  updateNotes(
    @CurrentUser() user: RequestUser,
    @Param('worldId') worldId: string,
    @Body() dto: UpdateWorldGmNotesDto,
  ) {
    return this.service.updateNotes(user, worldId, dto.content);
  }
}
