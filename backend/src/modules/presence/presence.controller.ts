import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PresenceService } from './presence.service';

@ApiTags('Presence')
@ApiBearerAuth()
@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Get('online')
  @ApiOperation({
    summary: 'Seznam online uživatelů (aktivních za posledních 25h)',
  })
  @ApiResponse({ status: 200, description: 'string[] — pole userIds' })
  getOnline(): Promise<string[]> {
    return this.presenceService.getOnlineUserIds();
  }
}
