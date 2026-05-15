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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { IkarosEventsService } from './ikaros-events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateIkarosEventDto } from './dto/create-ikaros-event.dto';
import { UpdateIkarosEventDto } from './dto/update-ikaros-event.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

/** Spec 2.1b — `?limit` parse na bezpečný int. Default 5, max 20. */
function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 5;
  return Math.min(n, 20);
}

/**
 * Spec 2.1b — globální platformové akce. Read = každý přihlášený, mutace =
 * Admin/Superadmin (kontroluje service), RSVP = každý přihlášený.
 */
@ApiTags('Ikaros Events')
@ApiBearerAuth()
@Controller('ikaros-events')
@UseGuards(JwtAuthGuard)
export class IkarosEventsController {
  constructor(private readonly service: IkarosEventsService) {}

  @Get()
  @ApiOperation({ summary: 'Globální Ikaros akce (přihlášení)' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.id);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Nadcházející akce (default 5, max 20)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200 })
  findUpcoming(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
  ) {
    return this.service.findUpcoming(user.id, parseLimit(limit));
  }

  @Post()
  @ApiOperation({ summary: 'Vytvoření akce (Admin/Superadmin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(@Body() dto: CreateIkarosEventDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Úprava akce (Admin/Superadmin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIkarosEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání akce (Admin/Superadmin, soft delete)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.role);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Toggle potvrzení účasti (přihlášení)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409, description: 'RSVP u akce zakázáno' })
  confirm(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.confirm(id, user.id);
  }
}
