import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { GlobalChatService } from './global-chat.service';
import { CreateGlobalMessageDto } from './dto/create-global-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';

@Controller('global-chat')
@UseGuards(JwtAuthGuard)
export class GlobalChatController {
  constructor(private readonly globalChatService: GlobalChatService) {}

  @Get('messages')
  getMessages(
    @CurrentUser() user: RequestUser,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.globalChatService.getMessages(user.id, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('messages')
  sendMessage(
    @Body() dto: CreateGlobalMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.globalChatService.sendMessage(dto, user);
  }

  @Delete('messages/:messageId')
  @UseGuards(AdminGuard)
  deleteMessage(@Param('messageId') messageId: string) {
    return this.globalChatService.deleteMessage(messageId);
  }
}
