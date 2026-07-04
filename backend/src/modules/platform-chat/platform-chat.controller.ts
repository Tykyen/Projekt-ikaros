import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { PlatformChatService } from './platform-chat.service';
import { CreatePlatformMessageDto } from './dto/create-platform-message.dto';
import { CreatePlatformChannelDto } from './dto/create-platform-channel.dto';
import { UpdatePlatformChannelDto } from './dto/update-platform-channel.dto';

/**
 * 20.5 — interní chat správy platformy. Celý controller je jen pro
 * Superadmin + Admin (class-level `@Roles`); správa konverzací (create /
 * update / delete) je zúžená na Superadmin (method-level override).
 */
@ApiTags('platform-chat')
@Controller('admin-chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Superadmin, UserRole.Admin)
export class PlatformChatController {
  constructor(private readonly service: PlatformChatService) {}

  @Get('channels')
  listChannels(@CurrentUser() user: RequestUser) {
    return this.service.listChannels(user);
  }

  @Get('channels/:channelId/messages')
  getMessages(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getMessages(channelId, user, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('channels/:channelId/messages')
  sendMessage(
    @Param('channelId') channelId: string,
    @Body() dto: CreatePlatformMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.sendMessage(channelId, dto, user);
  }

  @Delete('channels/:channelId/messages/:messageId')
  @HttpCode(204)
  async deleteMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.deleteMessage(channelId, messageId, user);
  }

  @Post('channels/:channelId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  uploadFile(
    @Param('channelId') channelId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'PLATFORM_CHAT_NO_FILE',
        message: 'Soubor je povinný',
      });
    }
    return this.service.uploadFile(channelId, file, user);
  }

  // ── Správa konverzací — jen Superadmin ─────────────────────────────────

  @Post('channels')
  @Roles(UserRole.Superadmin)
  createChannel(
    @Body() dto: CreatePlatformChannelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createChannel(dto, user);
  }

  @Patch('channels/:channelId')
  @Roles(UserRole.Superadmin)
  updateChannel(
    @Param('channelId') channelId: string,
    @Body() dto: UpdatePlatformChannelDto,
  ) {
    return this.service.updateChannel(channelId, dto);
  }

  @Delete('channels/:channelId')
  @Roles(UserRole.Superadmin)
  @HttpCode(204)
  async deleteChannel(@Param('channelId') channelId: string) {
    await this.service.deleteChannel(channelId);
  }
}
