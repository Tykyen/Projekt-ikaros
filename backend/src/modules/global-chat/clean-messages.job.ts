import { Injectable, Inject, Logger } from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import { GlobalChatService } from './global-chat.service';
import { UploadService } from '../upload/upload.service';
import { HOURS_2_MS } from '../../common/constants/time.constants';

@Injectable()
export class CleanMessagesJob {
  private readonly logger = new Logger(CleanMessagesJob.name);

  constructor(
    @Inject('IChatMessageRepository')
    private readonly messageRepo: IChatMessageRepository,
    private readonly globalChatService: GlobalChatService,
    private readonly uploadService: UploadService,
  ) {}

  @Cron(CronExpression.EVERY_2_HOURS)
  async clean(): Promise<void> {
    const channelIds = this.globalChatService.getAllChannelIds();
    if (channelIds.length === 0) return;
    const olderThan = new Date(Date.now() - HOURS_2_MS);
    try {
      let deleted = 0;
      for (const channelId of channelIds) {
        const { deletedCount, attachments } =
          await this.messageRepo.pruneChannel(channelId, olderThan, 100);
        deleted += deletedCount;
        // Cloudinary úklid příloh expirovaných zpráv (4.3b) — best-effort.
        if (attachments.length > 0) {
          await this.uploadService.deleteAttachments(attachments);
        }
      }
      if (deleted > 0) {
        this.logger.log(
          `CleanMessages: smazáno ${deleted} zpráv z globálního chatu`,
        );
      }
    } catch (err) {
      logError(this.logger, 'CleanMessages: chyba při čistění', err);
    }
  }
}
