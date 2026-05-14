import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WorldCalendarConfigService } from './world-calendar-config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { UpsertWorldCalendarConfigDto } from './dto/upsert-world-calendar-config.dto';

@ApiTags('World Calendar Config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('worlds/:worldId/calendar-config')
export class WorldCalendarConfigController {
  constructor(private readonly service: WorldCalendarConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Calendar config světa (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  getConfig(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getConfig(worldId, user);
  }

  @Put()
  @ApiOperation({
    summary: 'Upsert calendar config (Admin/PJ/PomocnyPJ)',
    description:
      'PUT je **full-replace upsert** — celý config se přepisuje. Všechna pole (včetně `hoursPerDay`, `daysOfWeek`, `months`, `celestialBodies`, `referenceDate`) musí být v requestu, jinak se přepíší na default. Pokud klient odešle `referenceDate.hour` bez explicitního `hoursPerDay`, použije se default 24 (přepíše stávající `hoursPerDay`).',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404, description: 'Svět nenalezen' })
  upsertConfig(
    @Param('worldId') worldId: string,
    @Body() dto: UpsertWorldCalendarConfigDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.upsertConfig(worldId, dto, user);
  }
}
