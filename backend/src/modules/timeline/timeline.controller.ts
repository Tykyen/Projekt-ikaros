import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TimelineService } from './timeline.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { QueryTimelineEventDto } from './dto/query-timeline-event.dto';

@ApiTags('Timeline')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('timeline')
export class TimelineController {
  constructor(private readonly service: TimelineService) {}

  @Get()
  @ApiOperation({
    summary:
      'Seznam událostí světa (member světa). Sort year/month/day/hour ASC.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404, description: 'Svět neexistuje' })
  findMany(
    @Query() query: QueryTimelineEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.findMany(
      {
        worldId: query.worldId,
        limit: query.limit,
        fromYear: query.fromYear,
        toYear: query.toYear,
      },
      user,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail události (member světa)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post()
  @ApiOperation({
    summary: 'Vytvoř událost (Admin/Superadmin/PJ/PomocnyPJ světa)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(
    @Body() dto: CreateTimelineEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Aktualizuj událost (partial)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'worldId v body zakázán' })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimelineEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smaž událost' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.delete(id, user);
  }
}
