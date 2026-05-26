// backend/src/modules/world-weather/custom-weather-preset.controller.ts

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
import {
  CreateCustomPresetDto,
  UpdateCustomPresetDto,
} from './dto/custom-weather-preset.dto';

/**
 * 9.4-dluh — Custom weather preset endpoints (per-world scoped).
 *
 * Routes:
 *  - GET  /worlds/:worldId/custom-presets         — list (member)
 *  - POST /worlds/:worldId/custom-presets         — create (PomocnyPJ+)
 *  - PUT  /worlds/:worldId/custom-presets/:id     — update metadata (PomocnyPJ+)
 *  - DEL  /worlds/:worldId/custom-presets/:id     — delete (PJ+)
 *  - POST /worlds/:worldId/custom-presets/:id/use — increment usage (PomocnyPJ+)
 */
@ApiTags('World Weather Custom Presets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('worlds/:worldId/custom-presets')
export class CustomWeatherPresetController {
  constructor(private readonly service: WorldWeatherService) {}

  @Get()
  @ApiOperation({ summary: 'Seznam custom presetů světa (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  list(@Param('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    return this.service.listCustomPresets(worldId, user);
  }

  @Post()
  @ApiOperation({ summary: 'Vytvoř custom preset (PomocnyPJ+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateCustomPresetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createCustomPreset(worldId, dto, user);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Update jen metadata (name/description/emoji). Config je immutable.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomPresetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateCustomPreset(worldId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smaž custom preset (PJ+)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.deleteCustomPreset(worldId, id, user);
  }

  @Post(':id/use')
  @ApiOperation({
    summary:
      'Increment usageCount — FE volá při „Použít" v wizardu (PomocnyPJ+)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  use(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.useCustomPreset(worldId, id, user);
  }
}
