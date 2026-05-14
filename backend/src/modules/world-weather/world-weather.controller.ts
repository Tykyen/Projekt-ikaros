// backend/src/modules/world-weather/world-weather.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
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
  @ApiOperation({ summary: 'Vygeneruj počasí' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  generate(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.generate(worldId, id, user);
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
}
