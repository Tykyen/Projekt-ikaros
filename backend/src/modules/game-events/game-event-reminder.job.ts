import { Injectable, Inject, Logger } from '@nestjs/common';
import { logError, logWarn } from '../../common/logging/log-error.util';
import { Cron } from '@nestjs/schedule';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import type {
  GameEvent,
  ReminderField,
} from './interfaces/game-event.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { PushService } from '../push/push.service';
import { CronLockService } from '../../common/locks/cron-lock.service';
import {
  HOURS_23_MS,
  HOURS_25_MS,
  MIN_45_MS,
  MIN_75_MS,
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
    private readonly cronLock: CronLockService,
  ) {}

  // 15.9 — à 15 min (dřív hourly), aby 1h okno (0.75–1.25h) trefilo přesně.
  // CronLock — při 2+ replikách BE jen jedna instance; jinak dvojí push
  // (markReminderSent přijde až PO odeslání → gate sám o sobě nestačí).
  @Cron('*/15 * * * *')
  async sendRemindersCron(): Promise<void> {
    await this.cronLock.withLock('game-event-reminders', () =>
      this.sendReminders(),
    );
  }

  async sendReminders(): Promise<void> {
    const now = Date.now();
    // 24h připomínka — okno 23–25h, gate `reminderSent`.
    await this.processWindow(
      new Date(now + HOURS_23_MS),
      new Date(now + HOURS_25_MS),
      'reminderSent',
      'za 24 hodin',
    );
    // 1h připomínka — okno 0.75–1.25h, gate `reminder1hSent`.
    await this.processWindow(
      new Date(now + MIN_45_MS),
      new Date(now + MIN_75_MS),
      'reminder1hSent',
      'za hodinu',
    );
  }

  /** Pošle připomínku eventům v okně a označí příslušný flag (idempotence). */
  private async processWindow(
    from: Date,
    to: Date,
    reminderField: ReminderField,
    when: string,
  ): Promise<void> {
    let events: GameEvent[];
    try {
      events = await this.gameEventRepo.findUpcoming(from, to, reminderField);
    } catch (err) {
      logError(
        this.logger,
        `GameEventReminderJob: chyba při načítání eventů (${reminderField})`,
        err,
      );
      return;
    }

    for (const event of events) {
      try {
        const userIds = await this.resolveRecipients(event);
        if (userIds.length > 0) {
          await this.pushService.notifyUsers(
            userIds,
            {
              title: 'Připomínka události',
              body: `${event.title} — začíná ${when}`,
            },
            'worldEvent',
          );
        }
        await this.gameEventRepo.markReminderSent(event.id, reminderField);
      } catch (err) {
        logWarn(
          this.logger,
          `GameEventReminderJob: chyba pro event ${event.id} (${reminderField})`,
          err,
        );
      }
    }
  }

  /** Členové světa, kteří mají dostat připomínku (mimo Zadatele; group-only filtr). */
  private async resolveRecipients(event: GameEvent): Promise<string[]> {
    const members = await this.membershipRepo.findByWorldId(event.worldId);
    const eligible = members.filter((m) => m.role !== WorldRole.Zadatel);
    const recipients = event.groupOnly
      ? eligible.filter(
          (m) =>
            m.role >= WorldRole.PomocnyPJ ||
            (event.targetGroup !== null && m.group === event.targetGroup),
        )
      : eligible;
    return recipients.map((m) => m.userId);
  }
}
