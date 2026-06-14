import { Injectable, Inject, Logger } from '@nestjs/common';
import { logError, logWarn } from '../../common/logging/log-error.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { PushService } from '../push/push.service';
import {
  HOURS_23_MS,
  HOURS_25_MS,
} from '../../common/constants/time.constants';

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
    const from = new Date(now.getTime() + HOURS_23_MS);
    const to = new Date(now.getTime() + HOURS_25_MS);

    let events: Awaited<ReturnType<IGameEventRepository['findUpcoming']>>;
    try {
      events = await this.gameEventRepo.findUpcoming(from, to);
    } catch (err) {
      logError(
        this.logger,
        'GameEventReminderJob: chyba při načítání eventů',
        err,
      );
      return;
    }

    for (const event of events) {
      try {
        const members = await this.membershipRepo.findByWorldId(event.worldId);
        const eligible = members.filter((m) => m.role !== WorldRole.Zadatel);

        const recipients = event.groupOnly
          ? eligible.filter(
              (m) =>
                m.role >= WorldRole.PomocnyPJ ||
                (event.targetGroup !== null && m.group === event.targetGroup),
            )
          : eligible;

        const userIds = recipients.map((m) => m.userId);

        if (userIds.length > 0) {
          await this.pushService.notifyUsers(userIds, {
            title: 'Připomínka události',
            body: `${event.title} — začíná za 24 hodin`,
          });
        }

        await this.gameEventRepo.markReminderSent(event.id);
      } catch (err) {
        logWarn(
          this.logger,
          `GameEventReminderJob: chyba pro event ${event.id}`,
          err,
        );
      }
    }
  }
}
