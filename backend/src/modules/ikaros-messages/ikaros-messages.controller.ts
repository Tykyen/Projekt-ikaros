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
import { ResolveIkarosMessageDto } from './dto/resolve-ikaros-message.dto';

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
  ) {
    return this.service.getInbox(user.id, this.parseLimit(limit), before);
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
  @ApiOperation({ summary: 'Počet nepřečtených zpráv a čekajících žádostí' })
  @ApiResponse({ status: 200, description: 'Počty nepřečtených' })
  getUnreadCount(@CurrentUser() user: RequestUser) {
    return this.service.getUnreadCount(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail zprávy (označí jako přečtenou)' })
  @ApiResponse({ status: 200, description: 'Detail zprávy' })
  @ApiResponse({ status: 404, description: 'Zpráva nenalezena' })
  getById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.getById(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Odeslání nové zprávy' })
  @ApiResponse({ status: 201, description: 'Zpráva odeslána' })
  create(
    @Body() dto: CreateIkarosMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, { id: user.id, username: user.username });
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

  @Post(':id/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Přijetí/odmítnutí žádosti o vstup do světa' })
  @ApiResponse({ status: 204, description: 'Žádost vyřešena' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveIkarosMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.resolve(id, dto, user.id);
  }
}
