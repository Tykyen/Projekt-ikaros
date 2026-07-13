import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronLockService } from '../../common/locks/cron-lock.service';
import { AlertService } from '../../common/alerting/alert.service';
import { logError, logWarn } from '../../common/logging/log-error.util';
import type { IMailerProvider } from './interfaces/mailer-provider.interface';
import {
  MAIL_PRIORITY_HIGH,
  type IMailDailyCounterRepository,
  type IMailOutboxRepository,
  type MailOutboxEntry,
} from './interfaces/mail-outbox.interface';
import { maskEmail } from './mask-email.util';

/**
 * Odesílací cron mail outboxu (D-LAUNCH-GAP „SMTP bez fronty").
 *
 * À 30 s vyzvedne dávku due pending mailů (priorita ASC → FIFO) a předá je
 * SMTP. Chování:
 *  - **Denní cap** (`SMTP_DAILY_CAP`, default 400 = rezerva pod Gmail ~500):
 *    po dosažení jde ven UŽ JEN vysoká priorita (reset hesla); ostatní se
 *    odloží na další den (žádné započítání pokusu) + logWarn/alert.
 *  - **Retry s backoffem**: 1 → 5 → 30 → 240 min; po MAX_ATTEMPTS (5) →
 *    `failed` + logError + alert (reset hesla = critical).
 *  - **Claim lease**: výběr atomicky posune `nextAttemptAt` o 5 min → crash
 *    uprostřed odeslání se sám zahojí, dvě instance si mail nevyzvednou.
 *  - **CronLock** (Redis): dávku posílá jen jedna instance; lock je
 *    best-effort — při výpadku Redisu kryje duplicitní send claim lease.
 *  - „Předáno SMTP" ≠ doručeno — bounce chodí async; per-mail se ukládá SMTP
 *    odpověď (`smtpResponse`) resp. chyba (`lastError`), žádná doručenka se
 *    nepředstírá.
 *
 * Běží jen s queueable providerem (SMTP) — dev LogMailerProvider posílá přímo
 * a nic se neenqueuuje, cron je no-op (žádné Mongo dotazy à 30 s v dev/e2e).
 */
@Injectable()
export class MailOutboxSender {
  static readonly MAX_ATTEMPTS = 5;
  static readonly BATCH_SIZE = 20;
  /** Lease claimu — musí přežít nejpomalejší SMTP pokus (timeouty ~40 s). */
  static readonly CLAIM_LEASE_MS = 5 * 60_000;
  /** Backoff před n-tým retry (minuty); poslední hodnota platí pro zbytek. */
  static readonly BACKOFF_MINUTES: readonly number[] = [1, 5, 30, 240];
  static readonly DEFAULT_DAILY_CAP = 400;

  private readonly logger = new Logger(MailOutboxSender.name);
  private readonly dailyCap: number;

  constructor(
    @Inject('IMailOutboxRepository')
    private readonly outboxRepo: IMailOutboxRepository,
    @Inject('IMailDailyCounterRepository')
    private readonly counterRepo: IMailDailyCounterRepository,
    @Inject('IMailerProvider')
    private readonly provider: IMailerProvider,
    private readonly cronLock: CronLockService,
    private readonly alerts: AlertService,
    config: ConfigService,
  ) {
    const raw = Number(config.get<string>('SMTP_DAILY_CAP'));
    this.dailyCap =
      Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : MailOutboxSender.DEFAULT_DAILY_CAP;
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'mail-outbox-sender' })
  async tickCron(): Promise<void> {
    // Dev/e2e (LogMailerProvider) → nic se neenqueuuje, neobtěžuj Mongo.
    if (!this.provider.queueable) return;
    await this.cronLock.withLock('mail-outbox-sender', () =>
      this.processBatch(),
    );
  }

  /** Zpracuje jednu dávku; `now` injektovatelné kvůli testům. */
  async processBatch(now: Date = new Date()): Promise<void> {
    const day = MailOutboxSender.dayKey(now);
    let sentToday = await this.counterRepo.getSent(day);
    let deferred = 0;

    for (let i = 0; i < MailOutboxSender.BATCH_SIZE; i++) {
      const mail = await this.outboxRepo.claimDue(
        now,
        MailOutboxSender.CLAIM_LEASE_MS,
      );
      if (!mail) break;

      // Denní cap: nad cap odchází už jen vysoká priorita (reset hesla).
      if (sentToday >= this.dailyCap && mail.priority !== MAIL_PRIORITY_HIGH) {
        await this.outboxRepo.defer(
          mail.id,
          MailOutboxSender.nextDayStart(now),
        );
        deferred += 1;
        continue;
      }

      let smtpResponse: string | undefined;
      try {
        smtpResponse = await this.provider.sendRendered({
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        });
      } catch (err) {
        await this.handleSendFailure(mail, err, now);
        continue;
      }

      // Odesláno — účetnictví už NESMÍ vyvolat re-send; jeho selhání jen log
      // (mail zůstane pending s lease → nejhorší případ = duplicitní mail).
      try {
        await this.outboxRepo.markSent(mail.id, new Date(), smtpResponse);
        sentToday = await this.counterRepo.incrementSent(day);
      } catch (err) {
        sentToday += 1; // lokální odhad, ať cap drží aspoň v rámci dávky
        logError(
          this.logger,
          `Outbox: mail odeslán, ale zápis stavu selhal (po lease hrozí duplicitní send): ${mail.category} → ${maskEmail(mail.to)}`,
          err,
        );
      }

      this.logger.log(
        `Outbox předáno SMTP serveru (doručení async): ${mail.category} → ${maskEmail(mail.to)} (${sentToday}/${this.dailyCap} dnes)`,
      );
      if (sentToday > this.dailyCap) {
        this.logger.warn(
          `Denní cap ${this.dailyCap} překročen vysokou prioritou (${sentToday} dnes) — blížíme se tvrdému limitu poskytovatele.`,
        );
      }
    }

    if (deferred > 0) {
      this.logger.warn(
        `SMTP denní cap dosažen (${sentToday}/${this.dailyCap}) — ${deferred} mailů odloženo na další den; odchází už jen vysoká priorita (reset hesla).`,
      );
      await this.alerts.alert(
        'warn',
        'SMTP denní cap dosažen',
        `Odesláno dnes ${sentToday}/${this.dailyCap}; ${deferred} mailů odloženo na další den. Odchází už jen reset hesla.`,
        { dedupeKey: 'smtp-daily-cap' },
      );
    }
  }

  private async handleSendFailure(
    mail: MailOutboxEntry,
    err: unknown,
    now: Date,
  ): Promise<void> {
    const attempts = mail.attempts + 1;
    // SMTP chyba per adresát → do outbox záznamu (bounce-lite evidence).
    const errMsg = err instanceof Error ? err.message : String(err);

    if (attempts >= MailOutboxSender.MAX_ATTEMPTS) {
      await this.outboxRepo.markFailed(mail.id, attempts, errMsg);
      logError(
        this.logger,
        `Outbox: mail trvale selhal po ${attempts} pokusech: ${mail.category} → ${maskEmail(mail.to)}`,
        err,
      );
      await this.alerts.alert(
        mail.priority === MAIL_PRIORITY_HIGH ? 'critical' : 'warn',
        'Mail outbox: mail trvale selhal',
        `kategorie=${mail.category}, příjemce=${maskEmail(mail.to)}, pokusů=${attempts}, chyba=${errMsg}`,
      );
      return;
    }

    const backoff = MailOutboxSender.BACKOFF_MINUTES;
    const delayMin = backoff[Math.min(attempts - 1, backoff.length - 1)];
    await this.outboxRepo.scheduleRetry(
      mail.id,
      attempts,
      new Date(now.getTime() + delayMin * 60_000),
      errMsg,
    );
    logWarn(
      this.logger,
      `Outbox: odeslání selhalo (pokus ${attempts}/${MailOutboxSender.MAX_ATTEMPTS}, retry za ${delayMin} min): ${mail.category} → ${maskEmail(mail.to)}`,
      err,
    );
  }

  /** Klíč denního čítače — UTC den (konzervativní aproximace Gmail okna). */
  static dayKey(now: Date): string {
    return now.toISOString().slice(0, 10);
  }

  /** Odklad přes cap — začátek dalšího UTC dne (+5 min rezerva). */
  static nextDayStart(now: Date): Date {
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        5,
        0,
        0,
      ),
    );
  }
}
