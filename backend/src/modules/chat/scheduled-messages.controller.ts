import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import { CreateScheduledMessageDto } from './dto/create-scheduled-message.dto';
import type { IScheduledMessageRepository } from './interfaces/scheduled-message-repository.interface';
import type { ScheduledMessage } from './interfaces/scheduled-message.interface';

/**
 * 11.2-ext F — naplánované zprávy do světového chatu. Vytvoření / fronta /
 * zrušení. Vlastní odeslání řeší @Cron `ScheduledMessagesJob`.
 */
@Controller('worlds/:worldId/chat/scheduled')
@UseGuards(JwtAuthGuard)
export class ScheduledMessagesController {
  constructor(
    @Inject('IScheduledMessageRepository')
    private readonly repo: IScheduledMessageRepository,
    // UM-08 — origin validace příloh naplánované zprávy.
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
  ) {}

  @Get()
  findMine(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ScheduledMessage[]> {
    return this.repo.findPendingByOwner(user.id, worldId);
  }

  @Post()
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateScheduledMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScheduledMessage> {
    const sendAt = new Date(dto.sendAt);
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'SCHEDULED_MESSAGE_PAST',
        message: 'Čas odeslání musí být v budoucnosti',
      });
    }
    if (!dto.content && (!dto.attachments || dto.attachments.length === 0)) {
      throw new BadRequestException({
        code: 'SCHEDULED_MESSAGE_EMPTY',
        message: 'Zpráva musí mít text nebo přílohu',
      });
    }
    // UM-08 — ověř, že přílohy pocházejí z našeho uploadu (ne podstrčená cizí URL).
    this.uploadService.assertAttachmentsOrigin(dto.attachments, [
      'world-chat/',
      'chat/',
    ]);
    return this.repo.create({
      worldId,
      channelId: dto.channelId,
      ownerId: user.id,
      ownerName: user.username,
      ownerRole: user.role,
      content: dto.content,
      attachments: dto.attachments ?? [],
      sendAt,
      status: 'pending',
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        code: 'SCHEDULED_MESSAGE_NOT_FOUND',
        message: 'Naplánovaná zpráva nenalezena',
      });
    }
    if (
      existing.ownerId !== user.id &&
      !worldAdminBypass(user, existing.worldId)
    ) {
      throw new ForbiddenException({
        code: 'SCHEDULED_MESSAGE_FORBIDDEN',
        message: 'Zpráva patří jinému uživateli',
      });
    }
    await this.repo.delete(id);
  }
}
