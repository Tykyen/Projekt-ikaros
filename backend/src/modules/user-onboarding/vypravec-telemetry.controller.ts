import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import {
  VypravecTelemetryDocument,
  VypravecTelemetrySchemaClass,
} from './schemas/vypravec-telemetry.schema';
import { TelemetryBatchDto } from './dto/telemetry-batch.dto';

/**
 * Spec 26.6 (D11) — batch ingest telemetrie Vypravěče. Fire-and-forget
 * charakter: vždy 204, klient nečeká a neretryuje na obsahu odpovědi.
 * Vyhodnocení: `npm run vypravec:funnel` (scripts/vypravec-funnel.mjs).
 */
@ApiTags('UserOnboarding')
@Controller('vypravec/telemetry')
@UseGuards(JwtAuthGuard)
export class VypravecTelemetryController {
  constructor(
    @InjectModel(VypravecTelemetrySchemaClass.name)
    private readonly model: Model<VypravecTelemetryDocument>,
  ) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Batch telemetrie Vypravěče (TTL 90 dní)' })
  async ingest(
    @CurrentUser() user: RequestUser,
    @Body() dto: TelemetryBatchDto,
  ): Promise<void> {
    if (!dto.events.length) return;
    const now = new Date();
    await this.model.insertMany(
      dto.events.map((e) => ({
        userId: user.id,
        event: e.event,
        route: e.route,
        refId: e.refId,
        query: e.query,
        createdAt: now,
      })),
      { ordered: false },
    );
  }
}
