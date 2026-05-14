import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { CalendarsService } from './calendars.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { UpdateCalendarSettingsDto } from './dto/update-calendar-settings.dto';

@Controller('worlds/:worldId/calendars')
@UseGuards(JwtAuthGuard)
export class CalendarsController {
  constructor(private readonly calendarsService: CalendarsService) {}

  @Get('aggregate')
  async aggregate(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarsService.aggregate(worldId, user);
  }

  @Patch(':slug/settings')
  async updateSettings(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: UpdateCalendarSettingsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarsService.updateSettings(worldId, slug, body, user);
  }
}
