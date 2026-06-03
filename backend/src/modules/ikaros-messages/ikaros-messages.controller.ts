import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { IkarosMessagesService } from './ikaros-messages.service';
import { CreateIkarosMessageDto } from './dto/create-ikaros-message.dto';

@ApiTags('Ikaros Messages')
@ApiBearerAuth()
@Controller('ikaros-messages')
@UseGuards(JwtAuthGuard)
export class IkarosMessagesController {
  constructor(private readonly service: IkarosMessagesService) {}

  private parseLimit(limit?: string): number {
    if (!limit) return 50;
    const n = parseInt(limit, 10);
    return Number.isNaN(n) ? 50 : n;
  }

  @Get('inbox')
  @ApiOperation({ summary: 'Doručená pošta aktuálního uživatele' })
  @ApiResponse({ status: 200, description: 'Seznam přijatých zpráv' })
  getInbox(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('system') system?: string,
  ) {
    return this.service.getInbox(
      user.id,
      this.parseLimit(limit),
      before,
      system === 'true',
    );
  }

  @Get('sent')
  @ApiOperation({ summary: 'Odeslaná pošta aktuálního uživatele' })
  @ApiResponse({ status: 200, description: 'Seznam odeslaných zpráv' })
  getSent(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.service.getSent(user.id, this.parseLimit(limit), before);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Počet nepřečtených zpráv' })
  @ApiResponse({ status: 200, description: '{ unreadCount }' })
  getUnreadCount(@CurrentUser() user: RequestUser) {
    return this.service.getUnreadCount(user.id);
  }

  @Get('conversation/:conversationId')
  @ApiOperation({ summary: 'Celé vlákno konverzace (vzestupně)' })
  @ApiResponse({ status: 200, description: 'Seznam zpráv vlákna' })
  @ApiResponse({ status: 403, description: 'Nejsi účastník konverzace' })
  @ApiResponse({ status: 404, description: 'Konverzace nenalezena' })
  getConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getConversation(conversationId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail zprávy (označí jako přečtenou)' })
  @ApiResponse({ status: 200, description: 'Detail zprávy' })
  @ApiResponse({ status: 404, description: 'Zpráva nenalezena' })
  getById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.getById(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Odeslání nové zprávy nebo odpovědi ve vlákně' })
  @ApiResponse({ status: 201, description: 'Zpráva odeslána' })
  @ApiResponse({
    status: 403,
    description: 'Příjemce přijímá zprávy jen od přátel',
  })
  create(
    @Body() dto: CreateIkarosMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, {
      id: user.id,
      username: user.username,
      role: user.role,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Smazání zprávy (soft delete pro aktuálního uživatele)',
  })
  @ApiResponse({ status: 204, description: 'Zpráva smazána' })
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.softDelete(id, user.id);
  }
}
