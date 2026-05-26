// backend/src/modules/world-weather/weather-generator-set.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { WeatherGeneratorSetService } from './weather-generator-set.service';
import {
  CreateWeatherGeneratorSetDto,
  UpdateWeatherGeneratorSetDto,
  ApplySetDto,
} from './dto/weather-generator-set.dto';

/**
 * 9.4 Weather Generator Set endpoints — per-world scoped.
 *
 * Routes:
 *  - GET    /worlds/:worldId/weather-sets            — list (member)
 *  - GET    /worlds/:worldId/weather-sets/:id        — detail (member)
 *  - POST   /worlds/:worldId/weather-sets            — create (PomocnyPJ+)
 *  - PUT    /worlds/:worldId/weather-sets/:id        — update whitelist (PomocnyPJ+)
 *  - DELETE /worlds/:worldId/weather-sets/:id        — delete (PJ+)
 *  - POST   /worlds/:worldId/weather-sets/:id/apply  — apply (PomocnyPJ+)
 */
@ApiTags('World Weather Sets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('worlds/:worldId/weather-sets')
export class WeatherGeneratorSetController {
  constructor(private readonly service: WeatherGeneratorSetService) {}

  @Get()
  @ApiOperation({ summary: 'Seznam Weather Generator Sets světa (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  list(@Param('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    return this.service.list(worldId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail setu (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  getOne(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getOne(worldId, id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Vytvoř nový set (PomocnyPJ+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateWeatherGeneratorSetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(worldId, dto, user);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Update setu (PomocnyPJ+) — whitelist name/description/emoji/items',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWeatherGeneratorSetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(worldId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smaž set (PJ+) — destruktivní akce' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.remove(worldId, id, user);
  }

  @Post(':id/apply')
  @ApiOperation({
    summary:
      'Aplikuj set — vytvoří generátory z resolvedItems (FE pre-resolved configů). (PomocnyPJ+)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  apply(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: ApplySetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.apply(worldId, id, dto, user);
  }
}
