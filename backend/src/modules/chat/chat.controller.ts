import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
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

@Controller('worlds/:worldId/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ─── Groups ───────────────────────────────────────────────────────────────

  @Get('groups')
  getGroups(@Param('worldId') worldId: string) {
    return this.chatService.getGroupsWithChannels(worldId);
  }

  @Post('groups')
  createGroup(
    @Param('worldId') worldId: string,
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.createGroup(worldId, dto, user);
  }

  @Patch('groups/:groupId')
  updateGroup(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.updateGroup(groupId, dto, user);
  }

  @Delete('groups/:groupId')
  deleteGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteGroup(groupId, user);
  }

  // ─── Channels ─────────────────────────────────────────────────────────────

  @Post('groups/:groupId/channels')
  createChannel(
    @Param('groupId') groupId: string,
    @Body() dto: CreateChannelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.createChannel(groupId, dto, user);
  }

  @Patch('channels/:channelId')
  updateChannel(
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.updateChannel(channelId, dto, user);
  }

  @Delete('channels/:channelId')
  deleteChannel(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteChannel(channelId, user);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  @Get('channels/:channelId/messages')
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
  sendMessage(
    @Param('channelId') channelId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.sendMessage(channelId, dto, user);
  }

  @Patch('messages/:messageId')
  editMessage(
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.editMessage(messageId, dto, user);
  }

  @Delete('messages/:messageId')
  deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteMessage(messageId, user);
  }

  // ─── Read status ─────────────────────────────────────────────────────────

  @Post('channels/:channelId/read')
  markAsRead(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.markAsRead(channelId, user.id);
  }

  @Get('unread')
  getUnread(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.getUnreadCounts(worldId, user.id);
  }

  @Put('messages/:messageId/reactions/:emoji')
  toggleReaction(
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.toggleReaction(messageId, emoji, user);
  }
}
