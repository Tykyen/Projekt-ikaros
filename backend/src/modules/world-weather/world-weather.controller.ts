// backend/src/modules/world-weather/world-weather.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WorldWeatherService } from './world-weather.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CreateWeatherGeneratorDto } from './dto/create-weather-generator.dto';
import { UpdateWeatherGeneratorDto } from './dto/update-weather-generator.dto';
import { SetCurrentWeatherDto } from './dto/set-current-weather.dto';
import { BroadcastWeatherDto } from './dto/broadcast-weather.dto';
import { ReorderGeneratorsDto } from './dto/reorder-generators.dto';
import { SetInGameDateDto } from './dto/set-in-game-date.dto';

@ApiTags('World Weather')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('worlds/:worldId/weather-generators')
export class WorldWeatherController {
  constructor(private readonly service: WorldWeatherService) {}

  @Get()
  @ApiOperation({ summary: 'Seznam generátorů světa (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  getAll(@Param('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    return this.service.getAll(worldId, user);
  }

  // ⚠️ POŘADÍ ROUTES: literal-path PŘED `:id` parameter routes.
  // NestJS top-down matching by jinak match `set-in-game-date` na `:id`
  // a service by dostala 'set-in-game-date' jako ObjectId → 404.
  //
  // ─── Literal-path routes (no `:id` parameter) ──────────────────────────

  @Post()
  @ApiOperation({ summary: 'Vytvoř generátor (Admin/Superadmin/PJ/PomocnyPJ)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateWeatherGeneratorDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(worldId, dto, user);
  }

  @Put('reorder')
  @ApiOperation({
    summary: '9.4-I — Přeřadí generátory podle orderedIds (PomocnyPJ+)',
  })
  @ApiResponse({ status: 200, description: 'Vrací seřazený list generátorů' })
  @ApiResponse({ status: 400, description: 'Chyba ve validaci orderedIds' })
  @ApiResponse({ status: 403 })
  reorder(
    @Param('worldId') worldId: string,
    @Body() dto: ReorderGeneratorsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reorder(worldId, dto, user);
  }

  // ─── 9.4 — Set explicit in-game date ────────────────────────────────────
  @Put('set-in-game-date')
  @ApiOperation({
    summary:
      '9.4 — Explicit nastav in-game datum světa. Volitelně regeneruj počasí všech generátorů (PomocnyPJ+).',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Neplatné datum' })
  @ApiResponse({ status: 403 })
  async setInGameDate(
    @Param('worldId') worldId: string,
    @Body() dto: SetInGameDateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.setInGameDate(worldId, dto, user);
  }

  // ─── 9.4 dluh #1 — Advance-day mechanism ────────────────────────────────
  @Post('advance-day')
  @ApiOperation({
    summary:
      '9.4 dluh #1 — Posune in-game date o N dní + vygeneruje počasí všem generátorům (PomocnyPJ+).',
  })
  @ApiResponse({ status: 200, description: 'Nová in-game date + updated list' })
  @ApiResponse({ status: 400, description: 'days mimo rozsah 1–365' })
  @ApiResponse({ status: 403 })
  advanceDay(
    @Param('worldId') worldId: string,
    @Body() body: { days?: number },
    @CurrentUser() user: RequestUser,
  ) {
    const days = body?.days ?? 1;
    return this.service.advanceDay(worldId, user, days);
  }

  // ─── Parameter routes (`:id`) — MUSÍ být POD literal routes ────────────

  @Get(':id')
  @ApiOperation({ summary: 'Detail generátoru (member)' })
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

  @Put(':id')
  @ApiOperation({ summary: 'Aktualizuj generátor' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWeatherGeneratorDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(worldId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smaž generátor' })
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

  @Post(':id/generate')
  @ApiOperation({
    summary:
      'Vygeneruj počasí. 9.4-I: optional monthIndex query (PJ explicit in-game měsíc). 9.4: pokud chybí, BE použije worldSettings.currentInGameDate.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  generate(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('monthIndex', new ParseIntPipe({ optional: true }))
    monthIndex?: number,
    @Query('day', new ParseIntPipe({ optional: true })) day?: number,
    @Query('seed', new ParseIntPipe({ optional: true })) seed?: number,
  ) {
    return this.service.generate(worldId, id, user, {
      monthIndex,
      day,
      seed,
    });
  }

  @Put(':id/current')
  @ApiOperation({ summary: 'Ručně nastav aktuální počasí' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  setCurrentWeather(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: SetCurrentWeatherDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.setCurrentWeather(worldId, id, dto, user);
  }

  // ─── 9.4 dluh #2 — Historie počasí ──────────────────────────────────────
  @Get(':id/history')
  @ApiOperation({
    summary:
      '9.4 dluh #2 — Historie snapshotů počasí (member read). limit max 200.',
  })
  @ApiResponse({ status: 200, description: '{ items, total } sort desc' })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  getHistory(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.service.getHistory(worldId, id, user, { limit, offset });
  }

  @Post(':id/broadcast')
  @HttpCode(204)
  @ApiOperation({ summary: 'Odešli aktuální počasí do chatu nebo mapy' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({
    status: 404,
    description: 'Channel nebo generator neexistuje',
  })
  @ApiResponse({ status: 409, description: 'currentWeather není nastaveno' })
  async broadcast(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: BroadcastWeatherDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.broadcast(worldId, id, dto, user);
  }

  // 10.2i — PJ vypne počasí na taktické mapě (World.activeMapWeather → null).
  // 2-segmentová cesta, aby nekolidovala s `@Delete(':id')`.
  @Delete('map-weather/active')
  @HttpCode(204)
  @ApiOperation({ summary: '10.2i — Vypni počasí na taktické mapě světa' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async clearMapWeather(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.clearMapWeather(worldId, user);
  }
}
