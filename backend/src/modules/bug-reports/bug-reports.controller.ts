import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { BugReportsService } from './bug-reports.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import type { BugReportStatus } from './interfaces/bug-report.interface';

/**
 * Spec 25.1 — hlášení chyb. POST je VEŘEJNÝ (anon i přihlášený, throttled) —
 * proto guard per-metoda, ne na třídě (JwtAuthGuard na třídě by anon 401).
 * Výpis + resolve jen platformový Admin/Superadmin.
 */
@ApiTags('BugReports')
@Controller('bug-reports')
export class BugReportsController {
  constructor(private readonly service: BugReportsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Nahlásit chybu (anon i přihlášený)' })
  @ApiResponse({ status: 201 })
  create(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: CreateBugReportDto,
  ): Promise<{ id: string }> {
    return this.service.create(user, dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Superadmin, UserRole.Admin)
  @ApiOperation({ summary: 'Admin inbox hlášení chyb' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  list(
    @Query('status') status?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const st: BugReportStatus | undefined =
      status === 'new' || status === 'resolved' ? status : undefined;
    return this.service.list(st, Number(offset), Number(limit));
  }

  @Post(':id/resolve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Superadmin, UserRole.Admin)
  @ApiOperation({ summary: 'Označit hlášení jako vyřešené' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  resolve(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.service.resolve(user, id);
  }
}
