import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUsersRepository } from '../interfaces/users-repository.interface';
import { MailerService } from '../../mailer/mailer.service';

/**
 * SP4 stub — sweep pending-deletion users po 30 dnů grace period.
 *
 * Plnohodnotná logika (mail 24h předem, atomic hard-delete s PII zniching,
 * batch retries) je SP4b. Tento stub:
 *  - běží 1× za hodinu
 *  - log placeholder
 *  - SP4b doplní: usersRepo.findExpiredPendingDeletion → update { isDeleted: true } +
 *    events.emit('user.deletion.hard-deleted') + mailer.sendAccountDeletionScheduled 24h předem
 */
@Injectable()
export class AccountCleanupCron {
  private readonly logger = new Logger(AccountCleanupCron.name);
  static readonly GRACE_PERIOD_DAYS = 30;

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly events: EventEmitter2,
    private readonly mailer: MailerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  sweep(): void {
    // SP4 stub — placeholder. Reference deps tak, aby TS noUnusedLocals neporvalo
    // pri buildu. SP4b plnohodnotny impl:
    //   const expired = await this.usersRepo.findExpiredPendingDeletion(...);
    //   for (const u of expired) {
    //     await this.usersRepo.update(u.id, { isDeleted: true });
    //     this.events.emit('user.deletion.hard-deleted', { userId: u.id });
    //     // T-24h reminder mail handled separate scheduler
    //   }
    void this.usersRepo;
    void this.events;
    void this.mailer;
    this.logger.debug('AccountCleanupCron.sweep tick (SP4 stub)');
  }
}
