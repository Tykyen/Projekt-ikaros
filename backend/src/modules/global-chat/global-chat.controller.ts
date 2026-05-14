import {
  Controller,
  Get,
  Post,
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
import { GlobalChatService } from './global-chat.service';
import { GlobalChatGateway } from './global-chat.gateway';
import { CreateGlobalMessageDto } from './dto/create-global-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';

@ApiTags('Global Chat')
@ApiBearerAuth()
@Controller('global-chat')
@UseGuards(JwtAuthGuard)
export class GlobalChatController {
  constructor(
    private readonly globalChatService: GlobalChatService,
    private readonly globalChatGateway: GlobalChatGateway,
  ) {}

  @Get('room-info')
  @ApiOperation({
    summary: 'Info o místnosti — channelId + seznam přítomných uživatelů',
  })
  @ApiResponse({ status: 200, description: 'Info o místnosti' })
  getRoomInfo() {
    return {
      channelId: this.globalChatService.getGlobalChannelId(),
      users: this.globalChatGateway.getPresence(),
    };
  }

  @Get('messages')
  @ApiOperation({
    summary: 'Historie zpráv globálního chatu (posledních 60 min)',
  })
  @ApiResponse({ status: 200, description: 'Seznam zpráv' })
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
  @ApiOperation({ summary: 'Odeslání zprávy do globálního chatu' })
  @ApiResponse({ status: 201, description: 'Zpráva odeslána' })
  sendMessage(
    @Body() dto: CreateGlobalMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.globalChatService.sendMessage(dto, user);
  }

  @Delete('messages/:messageId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Smazání zprávy (Admin/Superadmin)' })
  @ApiResponse({ status: 204, description: 'Zpráva smazána' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  deleteMessage(@Param('messageId') messageId: string) {
    return this.globalChatService.deleteMessage(messageId);
  }
}
