import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DataExportService } from './data-export.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import type { DataExportPayload } from './interfaces/data-export-payload.interface';

@ApiTags('DataExport')
@ApiBearerAuth()
@Controller('data-export')
@UseGuards(JwtAuthGuard)
export class DataExportController {
  constructor(private readonly service: DataExportService) {}

  @Get('me')
  @ApiOperation({
    summary: 'GDPR — vlastní data export (JSON)',
  })
  @ApiResponse({ status: 200, description: 'DataExportPayload' })
  @ApiResponse({ status: 401, description: 'Bez JWT' })
  exportMe(@CurrentUser() user: RequestUser): Promise<DataExportPayload> {
    return this.service.exportForUser(user.id);
  }
}
