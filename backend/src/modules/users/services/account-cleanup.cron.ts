import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUsersRepository } from '../interfaces/users-repository.interface';
import { MailerService } from '../../mailer/mailer.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 1.3c (N-3) — hard-cleanup pending-deletion účtů po 30denním grace holdu.
 *
 * Běží denně v 03:00 (Europe/Prague, viz `@Cron` níže). Najde účty s
 * `deletionRequestedAt < now-30d` (a dosud
 * neanonymizované) a nevratně je anonymizuje (PII zničení, viz
 * `usersRepo.anonymizeForHardDelete`). Pro každý emituje `user.deletion.hardDeleted`,
 * který `admin.service` zapíše do audit logu (ACCOUNT_HARD_DELETE).
 *
 * Mimo rozsah (dluh): T-24h reminder mail před finálním smazáním. Mail po
 * anonymizaci nelze poslat (původní email je zničen), musel by jít z odděleného
 * scheduleru před cutoffem — řeší se později.
 */
@Injectable()
export class AccountCleanupCron {
  private readonly logger = new Logger(AccountCleanupCron.name);
  static readonly GRACE_PERIOD_DAYS = 30;

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly events: EventEmitter2,
    // Injectovaný pro budoucí T-24h reminder (viz JSDoc) — DI zachováno.
    private readonly mailer: MailerService,
  ) {
    void this.mailer;
  }

  // Spec 1.3c ř.393 — denně 03:00 Europe/Prague (mimo špičku).
  @Cron('0 3 * * *', {
    name: 'account-hard-delete',
    timeZone: 'Europe/Prague',
  })
  async sweep(): Promise<void> {
    const cutoff = new Date(
      Date.now() - AccountCleanupCron.GRACE_PERIOD_DAYS * DAY_MS,
    );
    const expired = await this.usersRepo.findExpiredPendingDeletion(cutoff);
    if (expired.length === 0) {
      this.logger.debug('AccountCleanupCron.sweep — nic k hard-cleanup');
      return;
    }

    this.logger.log(
      `AccountCleanupCron — ${expired.length} účtů po ${AccountCleanupCron.GRACE_PERIOD_DAYS}d holdu → hard-cleanup`,
    );

    for (const u of expired) {
      try {
        await this.usersRepo.anonymizeForHardDelete(
          u.id,
          `deleted-${u.id}@deleted.local`,
        );
        this.events.emit('user.deletion.hardDeleted', {
          userId: u.id,
          username: u.username,
          deletionRequestedBy: u.deletionRequestedBy,
          deletionReason: u.deletionReason,
          deletionRequestedAt: u.deletionRequestedAt,
        });
      } catch (err) {
        // Jeden selhaný účet nesmí zastavit zbytek dávky.
        this.logger.error(
          `Hard-cleanup selhal pro ${u.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
