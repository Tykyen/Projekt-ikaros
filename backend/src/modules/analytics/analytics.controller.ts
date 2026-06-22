import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { PageviewDto } from './dto/pageview.dto';
import { AnalyticsSummary } from './dto/analytics-summary.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

const ALLOWED_DAYS = [7, 30, 90];

/**
 * 15B.7 — self-hosted analytics.
 * `pageview` je VEŘEJNÝ (musí počítat i anon návštěvy); `summary` jen Admin+.
 */
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('pageview')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Anonymní page-view ping (boti/prerender ignorováni)',
  })
  async pageview(
    @Body() dto: PageviewDto,
    @Headers('user-agent') ua?: string,
  ): Promise<void> {
    // Vždy 204, i při ignoru — neprozrazuj návštěvníkovi, že byl odfiltrován.
    await this.analytics.record(dto, ua);
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Agregovaná návštěvnost pro admin Přehled' })
  async summary(@Query('days') daysRaw?: string): Promise<AnalyticsSummary> {
    const n = Number(daysRaw);
    const days = ALLOWED_DAYS.includes(n) ? n : 7;
    return this.analytics.getSummary(days);
  }
}
