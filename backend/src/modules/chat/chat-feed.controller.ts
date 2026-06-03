import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';

/**
 * Spec 13.2a — cross-world „Souhrn chatů". Záměrně mimo `worlds/:worldId/chat`
 * (ten je per-svět) — feed agreguje napříč VŠEMI mými světy. Access-safe:
 * `ChatService.getFeed` vrací jen kanály, kam mám přístup.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatFeedController {
  constructor(private readonly chatService: ChatService) {}

  @Get('feed')
  @ApiOperation({
    summary: 'Souhrn chatů — zprávy napříč všemi mými světy (cursor paginace)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  getFeed(
    @CurrentUser() user: RequestUser,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getFeed(user, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
