import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CalendarsService } from './calendars.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import type { CalendarEvent } from '../character-subdocs/interfaces/character-calendar.interface';

@Controller('calenders')
@UseGuards(JwtAuthGuard)
export class LegacyCalendersController {
  constructor(private readonly calendarsService: CalendarsService) {}

  @Get(':slug')
  async getCalendar(
    @Param('slug') slug: string,
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!worldId)
      throw new BadRequestException({
        code: 'WORLD_ID_REQUIRED',
        message: 'worldId je povinný parametr',
      });
    return this.calendarsService.getBySlug(slug, worldId, user.id);
  }

  @Put(':slug')
  async updateCalendar(
    @Param('slug') slug: string,
    @Query('worldId') worldId: string,
    @Body('events') events: CalendarEvent[],
    @CurrentUser() user: RequestUser,
  ) {
    if (!worldId)
      throw new BadRequestException({
        code: 'WORLD_ID_REQUIRED',
        message: 'worldId je povinný parametr',
      });
    return this.calendarsService.updateBySlug(
      slug,
      worldId,
      events ?? [],
      user.id,
    );
  }
}
