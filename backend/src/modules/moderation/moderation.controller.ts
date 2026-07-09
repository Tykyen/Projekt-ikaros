import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { ModerationService } from './moderation.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { CreateAppealDto } from './dto/create-appeal.dto';
import { ReviewAppealDto } from './dto/review-appeal.dto';

/**
 * Spec 20B (Fáze B1) — generický report & moderace. Fronta pro moderátory jede
 * přes existující `/pending-actions?type=content_report` (ContentReportProvider),
 * ne přes vlastní list endpoint.
 */
@ApiTags('Moderation')
@ApiBearerAuth()
@Controller('moderation')
@UseGuards(JwtAuthGuard)
export class ModerationController {
  constructor(private readonly service: ModerationService) {}

  @Post('reports')
  @ApiOperation({ summary: 'Vytvořit report (nahlásit obsah)' })
  @ApiResponse({ status: 201 })
  createReport(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReportDto,
  ): Promise<{ id: string }> {
    return this.service.createReport(user, dto);
  }

  @Get('reports/mine')
  @ApiOperation({ summary: 'Stav mých hlášení (oznamovatel)' })
  @ApiResponse({ status: 200 })
  myReports(@CurrentUser() user: RequestUser) {
    return this.service.myReports(user.id);
  }

  @Get('decisions/mine')
  @ApiOperation({
    summary: 'Odůvodnění zásahů vůči mému obsahu (autor, statement of reasons)',
  })
  @ApiResponse({ status: 200 })
  myDecisions(@CurrentUser() user: RequestUser) {
    return this.service.myDecisions(user.id);
  }

  @Get('log')
  @ApiOperation({ summary: 'Moderační log (audit, reviewer-gated)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  moderationLog(
    @CurrentUser() user: RequestUser,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedOffset = Number(offset);
    const parsedLimit = Number(limit);
    return this.service.moderationLog(
      user,
      Number.isFinite(parsedOffset) ? parsedOffset : undefined,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Post('reports/:id/resolve')
  @ApiOperation({
    summary: 'Vyřídit report — zaznamenat rozhodnutí (reviewer-gated)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  resolveReport(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
  ): Promise<{ decisionId: string }> {
    return this.service.resolveReport(user, id, dto);
  }

  @Post('decisions/:id/appeal')
  @ApiOperation({
    summary: 'Odvolat se proti moderačnímu rozhodnutí (autor obsahu, čl. 20)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409 })
  submitAppeal(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateAppealDto,
  ): Promise<{ appealId: string }> {
    return this.service.submitAppeal(user, id, dto);
  }

  @Post('appeals/:id/review')
  @ApiOperation({
    summary: 'Přezkoumat odvolání (jiný moderátor než autor rozhodnutí)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409 })
  reviewAppeal(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewAppealDto,
  ) {
    return this.service.reviewAppeal(user, id, dto);
  }
}
