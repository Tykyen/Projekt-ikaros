import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { CreateWorldCalendarConfigDto } from './dto/create-world-calendar-config.dto';
import { PatchWorldCalendarConfigDto } from './dto/patch-world-calendar-config.dto';

@ApiTags('World Calendar Configs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('worlds/:worldId/calendar-configs')
export class WorldCalendarConfigController {
  constructor(private readonly service: WorldCalendarConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Seznam všech kalendářů světa (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  list(@Param('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    return this.service.list(worldId, user);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Detail kalendáře dle slug (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  getOne(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getBySlug(worldId, slug, user);
  }

  @Post()
  @ApiOperation({ summary: 'Vytvořit kalendář (PomocnyPJ+ / Admin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 409, description: 'SLUG_TAKEN' })
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateWorldCalendarConfigDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(worldId, dto, user);
  }

  @Patch(':slug')
  @ApiOperation({
    summary: 'Upravit kalendář (PomocnyPJ+ / Admin) — delta merge',
    description:
      'PATCH provádí delta merge — pouze fields přítomné v DTO se přepíší. ' +
      'Slug nelze měnit (rename = delete + create).',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  patch(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: PatchWorldCalendarConfigDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.patch(worldId, slug, dto, user);
  }

  @Delete(':slug')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazat kalendář (PomocnyPJ+ / Admin)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 403,
    description: 'DEFAULT_CONFIG_LOCKED — nejdřív nastav jiný default',
  })
  @ApiResponse({ status: 404 })
  async remove(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.remove(worldId, slug, user);
  }
}
