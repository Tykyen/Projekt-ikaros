import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import { GlobalChatService } from './global-chat.service';

@Injectable()
export class CleanMessagesJob {
  private readonly logger = new Logger(CleanMessagesJob.name);

  constructor(
    @Inject('IChatMessageRepository')
    private readonly messageRepo: IChatMessageRepository,
    private readonly globalChatService: GlobalChatService,
  ) {}

  @Cron(CronExpression.EVERY_2_HOURS)
  async clean(): Promise<void> {
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId) return;
    const olderThan = new Date(Date.now() - 2 * 60 * 60 * 1000);
    try {
      const deleted = await this.messageRepo.pruneChannel(channelId, olderThan, 100);
      if (deleted > 0) {
        this.logger.log(`CleanMessages: smazáno ${deleted} zpráv z hospody`);
      }
    } catch (err) {
      this.logger.error('CleanMessages: chyba při čistění', err);
    }
  }
}
