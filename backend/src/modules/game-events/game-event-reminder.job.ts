import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { PushService } from '../push/push.service';

@Injectable()
export class GameEventReminderJob {
  private readonly logger = new Logger(GameEventReminderJob.name);

  constructor(
    @Inject('IGameEventRepository')
    private readonly gameEventRepo: IGameEventRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    private readonly pushService: PushService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(): Promise<void> {
    const now = new Date();
    const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    let events: Awaited<ReturnType<IGameEventRepository['findUpcoming']>>;
    try {
      events = await this.gameEventRepo.findUpcoming(from, to);
    } catch (err) {
      this.logger.error('GameEventReminderJob: chyba při načítání eventů', err);
      return;
    }

    for (const event of events) {
      try {
        const members = await this.membershipRepo.findByWorldId(event.worldId);
        const userIds = members
          .filter((m) => m.role !== 0 /* WorldRole.Pending */)
          .map((m) => m.userId);

        if (userIds.length > 0) {
          await this.pushService.notifyUsers(userIds, {
            title: 'Připomínka události',
            body: `${event.title} — začíná za 24 hodin`,
          });
        }

        await this.gameEventRepo.markReminderSent(event.id);
      } catch (err) {
        this.logger.warn(`GameEventReminderJob: chyba pro event ${event.id}`, err);
      }
    }
  }
}
