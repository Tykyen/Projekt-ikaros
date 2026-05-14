import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('worlds/:worldId/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ─── Groups ───────────────────────────────────────────────────────────────

  @Get('groups')
  @ApiOperation({ summary: 'Seznam chat skupin světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  getGroups(@Param('worldId') worldId: string) {
    return this.chatService.getGroupsWithChannels(worldId);
  }

  @Post('groups')
  @ApiOperation({ summary: 'Vytvoření chat skupiny (PJ/Admin)' })
  @ApiResponse({ status: 201, description: 'Vytvořeno' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createGroup(
    @Param('worldId') worldId: string,
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.createGroup(worldId, dto, user);
  }

  @Patch('groups/:groupId')
  @ApiOperation({ summary: 'Aktualizace chat skupiny' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  updateGroup(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.updateGroup(groupId, dto, user);
  }

  @Delete('groups/:groupId')
  @ApiOperation({ summary: 'Smazání chat skupiny' })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  deleteGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteGroup(groupId, user);
  }

  // ─── Channels ─────────────────────────────────────────────────────────────

  @Post('groups/:groupId/channels')
  @ApiOperation({ summary: 'Vytvoření chat kanálu' })
  @ApiResponse({ status: 201, description: 'Vytvořeno' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createChannel(
    @Param('groupId') groupId: string,
    @Body() dto: CreateChannelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.createChannel(groupId, dto, user);
  }

  @Patch('channels/:channelId')
  @ApiOperation({ summary: 'Aktualizace chat kanálu' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  updateChannel(
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.updateChannel(channelId, dto, user);
  }

  @Delete('channels/:channelId')
  @ApiOperation({ summary: 'Smazání chat kanálu (PJ/Admin)' })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  deleteChannel(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteChannel(channelId, user);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  @Get('channels/:channelId/messages')
  @ApiOperation({ summary: 'Zprávy kanálu (cursor-based paginace)' })
  @ApiResponse({ status: 200, description: 'OK' })
  getMessages(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(channelId, user.id, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('channels/:channelId/messages')
  @ApiOperation({ summary: 'Odeslání zprávy do kanálu' })
  @ApiResponse({ status: 201, description: 'Vytvořeno' })
  sendMessage(
    @Param('channelId') channelId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.sendMessage(channelId, dto, user);
  }

  @Patch('messages/:messageId')
  @ApiOperation({ summary: 'Editace zprávy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  editMessage(
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.editMessage(messageId, dto, user);
  }

  @Delete('messages/:messageId')
  @ApiOperation({
    summary: 'Smazání zprávy (soft delete nebo hard delete pro PJ)',
  })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteMessage(messageId, user);
  }

  // ─── Read status ─────────────────────────────────────────────────────────

  @Post('channels/:channelId/read')
  @ApiOperation({ summary: 'Označí kanál jako přečtený' })
  @ApiResponse({ status: 200, description: 'OK' })
  markAsRead(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.markAsRead(channelId, user.id);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Seznam kanálů světa s unread countsy a lastMsg' })
  @ApiResponse({ status: 200, description: 'OK' })
  getUnread(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.getUnreadCounts(worldId, user.id);
  }

  @Put('messages/:messageId/reactions/:emoji')
  @ApiOperation({ summary: 'Toggle emoji reakce na zprávu' })
  @ApiResponse({ status: 200, description: 'OK' })
  toggleReaction(
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.toggleReaction(messageId, emoji, user);
  }
}
