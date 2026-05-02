import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { IkarosMessagesService } from './ikaros-messages.service';
import { CreateIkarosMessageDto } from './dto/create-ikaros-message.dto';
import { ResolveIkarosMessageDto } from './dto/resolve-ikaros-message.dto';

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
  getInbox(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.service.getInbox(user.id, this.parseLimit(limit), before);
  }

  @Get('sent')
  getSent(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.service.getSent(user.id, this.parseLimit(limit), before);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: RequestUser) {
    return this.service.getUnreadCount(user.id);
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.getById(id, user.id);
  }

  @Post()
  create(@Body() dto: CreateIkarosMessageDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, { id: user.id, username: user.username });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.service.softDelete(id, user.id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveIkarosMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.resolve(id, dto, user.id);
  }
}
