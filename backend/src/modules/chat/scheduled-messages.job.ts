import { Injectable, Inject, Logger } from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatService } from './chat.service';
import type { CreateMessageDto } from './dto/create-message.dto';
import type { IScheduledMessageRepository } from './interfaces/scheduled-message-repository.interface';

/**
 * 11.2-ext F — každou minutu odešle naplánované zprávy, jejichž čas nastal.
 * Odeslání jde přes `ChatService.sendMessage` jménem ownera (uložené
 * ownerId/Name/Role → RequestUser), takže projde stejná access-kontrola jako
 * běžná zpráva. Selhání (např. ztracený přístup ke kanálu) → status `failed`.
 */
@Injectable()
export class ScheduledMessagesJob {
  private readonly logger = new Logger(ScheduledMessagesJob.name);

  constructor(
    @Inject('IScheduledMessageRepository')
    private readonly repo: IScheduledMessageRepository,
    private readonly chatService: ChatService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendDue(): Promise<void> {
    const due = await this.repo.findDue(new Date());
    for (const m of due) {
      try {
        await this.chatService.sendMessage(
          m.channelId,
          {
            content: m.content,
            attachments: m.attachments,
          } as CreateMessageDto,
          { id: m.ownerId, username: m.ownerName, role: m.ownerRole },
        );
        await this.repo.setStatus(m.id, 'sent');
      } catch (err) {
        logError(
          this.logger,
          `Naplánovaná zpráva ${m.id} se nepodařila odeslat`,
          err,
        );
        await this.repo.setStatus(m.id, 'failed');
      }
    }
  }
}
