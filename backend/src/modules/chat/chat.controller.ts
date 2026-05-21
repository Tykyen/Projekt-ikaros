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
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UseFilters,
  UploadedFile,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { UpdateAppearanceDto } from './dto/update-appearance.dto';
import { UploadService } from '../upload/upload.service';
import { MulterExceptionFilter } from '../upload/filters/multer-exception.filter';

/** Max velikost přílohy chatu — 10 MB (sjednoceno s globálním chatem). */
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('worlds/:worldId/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
  ) {}

  // ─── Groups ───────────────────────────────────────────────────────────────

  @Get('groups')
  @ApiOperation({ summary: 'Seznam chat kanálů a konverzací světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  getGroups(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.getGroupsWithChannels(worldId, user);
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

  /**
   * Krok 6.5a — bulk reorder kanálů světa (PJ+). Musí být **před** `groups/:groupId`
   * v dekorátorovém pořadí, jinak by `'reorder'` matchnul jako `:groupId` param.
   */
  @Post('groups/reorder')
  @ApiOperation({ summary: 'Reorder kanálů (bulk, PJ+)' })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 400, description: 'INVALID_GROUP_ID' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async reorderGroups(
    @Param('worldId') worldId: string,
    @Body() dto: ReorderItemsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.chatService.reorderGroups(worldId, dto.items, user);
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

  /**
   * Krok 6.5b — bulk reorder konverzací v rámci **jednoho** kanálu (PJ+).
   * Cross-group drag mimo rozsah (přesun přes `PATCH channels/:id { groupId }`).
   * Musí být před `channels/:channelId` v dekorátorovém pořadí.
   */
  @Post('channels/reorder')
  @ApiOperation({ summary: 'Reorder konverzací v jednom kanálu (bulk, PJ+)' })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({
    status: 400,
    description: 'MIXED_GROUPS / INVALID_CHANNEL_ID',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async reorderChannels(
    @Param('worldId') worldId: string,
    @Body() dto: ReorderItemsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.chatService.reorderChannels(worldId, dto.items, user);
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

  // ─── Hledání (krok 6.6) ───────────────────────────────────────────────────

  @Get('search')
  @ApiOperation({ summary: 'Hledání ve zprávách světa (substring)' })
  @ApiResponse({ status: 200, description: 'OK' })
  searchMessages(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
    @Query('q') q?: string,
    @Query('channelId') channelId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.searchMessages(worldId, user, {
      q: q ?? '',
      channelId: channelId || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
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

  // ─── Presence (krok 6.1d) ─────────────────────────────────────────────────

  @Get('channels/:channelId/presence')
  @ApiOperation({
    summary: 'Přítomní v konverzaci (REST seed presence panelu)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getChannelPresence(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.getChannelPresence(channelId, user.id);
  }

  // ─── Vzhled mé zprávy (krok 6.2f) ─────────────────────────────────────────

  @Get('appearance')
  @ApiOperation({
    summary: 'Per-svět barva + font mé zprávy (z WorldMembership)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Není členem světa' })
  getAppearance(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.getMembershipAppearance(worldId, user.id);
  }

  @Patch('appearance')
  @ApiOperation({
    summary: 'Uložit per-svět vzhled mé zprávy (null = reset na default)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Není členem světa' })
  updateAppearance(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateAppearanceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.updateMembershipAppearance(worldId, user.id, dto);
  }

  // ─── Upload příloh (krok 6.2b) ────────────────────────────────────────────

  @Post('upload')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ATTACHMENT_MAX_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Nahrání přílohy světového chatu (max 10 MB, obrázek/dokument)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Nahraná příloha (ChatAttachment)' })
  @ApiResponse({ status: 403, description: 'Není členem světa' })
  @ApiResponse({ status: 415, description: 'Nepodporovaný typ souboru' })
  async uploadAttachment(
    @Param('worldId') worldId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'UPLOAD_FILE_REQUIRED',
        message: 'Soubor je povinný',
      });
    }
    // Member-only guard — bez něj by libovolný přihlášený uživatel mohl nahrávat
    // přílohy do cizího světa (a žrát Cloudinary kvótu).
    await this.chatService.getMembershipAppearance(worldId, user.id);
    return this.uploadService.uploadWorldChatFile(file, worldId);
  }
}
