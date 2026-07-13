import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IMailerProvider,
  MailerTemplate,
  MailerPayload,
} from './interfaces/mailer-provider.interface';
import { MailOutboxService } from './mail-outbox.service';

/**
 * Public API pro odesílání transakčních emailů.
 *
 * Konkrétní backend (Logger pro dev, SMTP/SendGrid pro prod) je injectovaný
 * přes `IMailerProvider` interface. `dispatch()` swallows errors do log
 * — Mailer fail nikdy nebreaké volající flow (anti-enumeration v forgotPassword,
 * resilience proti SMTP timeoutům).
 *
 * D-LAUNCH-GAP „SMTP bez fronty": s SMTP providerem (`queueable`) se mail
 * NEposílá přímo, ale zapíše do Mongo outboxu (`mail_outbox`) — odesílá ho
 * cron `MailOutboxSender` (denní cap, retry/backoff, priorita reset hesla).
 * Fail-safe: když zápis do outboxu selže (Mongo down), mail jde PŘÍMO přes
 * provider — reset hesla nikdy neumře na frontě.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject('IMailerProvider')
    private readonly provider: IMailerProvider,
    private readonly outbox: MailOutboxService,
  ) {}

  async sendPasswordReset(opts: {
    to: string;
    username: string;
    token: string;
  }): Promise<void> {
    await this.dispatch('password_reset', opts);
  }

  async sendEmailVerification(opts: {
    to: string;
    username: string;
    token: string;
  }): Promise<void> {
    await this.dispatch('email_verification', opts);
  }

  async sendEmailChangeConfirm(opts: {
    to: string;
    username: string;
    token: string;
  }): Promise<void> {
    await this.dispatch('email_change_confirm', opts);
  }

  async sendEmailChangeNotice(opts: {
    to: string;
    username: string;
    oldEmail: string;
    newEmail: string;
  }): Promise<void> {
    await this.dispatch('email_change_notice', opts);
  }

  async sendUsernameDecided(opts: {
    to: string;
    username: string;
    decidedUsername: string;
  }): Promise<void> {
    await this.dispatch('username_decided', opts);
  }

  async sendAccountDeletionScheduled(opts: {
    to: string;
    username: string;
    scheduledFor: Date;
  }): Promise<void> {
    await this.dispatch('account_deletion_scheduled', opts);
  }

  /** Spec 20B čl. 16/3 — potvrzení příjmu reportu oznamovateli. */
  async sendModerationReportAck(opts: {
    to: string;
    username: string;
    reportId: string;
    submittedAt: Date;
  }): Promise<void> {
    await this.dispatch('moderation_report_ack', opts);
  }

  /** Spec 20B — vyrozumění oznamovateli, že jeho hlášení bylo vyřízeno. */
  async sendModerationReportResolved(opts: {
    to: string;
    username: string;
    reportId: string;
  }): Promise<void> {
    await this.dispatch('moderation_report_resolved', opts);
  }

  /** FIX-48 (log hygiene): e-mail je PII → do logu jen maskovaně (`t***@g***`), mirror smtp-mailer.provider.ts. */
  private static mask(email: string): string {
    const at = email.indexOf('@');
    if (at < 1) return '***';
    const domain = email.slice(at + 1);
    return `${email[0]}***@${domain[0] ?? ''}***`;
  }

  private async dispatch(
    template: MailerTemplate,
    payload: MailerPayload,
  ): Promise<void> {
    if (this.provider.queueable) {
      try {
        await this.outbox.enqueue(template, payload);
        return;
      } catch (err) {
        // Fail-safe: Mongo zápis do outboxu selhal → pošli PŘÍMO (reset hesla
        // nikdy neumře na frontě) + logError. Bez capu/retry, ale mail odejde.
        this.logger.error(
          `Mail outbox enqueue selhal — fallback na přímé odeslání: template=${template} to=${MailerService.mask(payload.to)}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    try {
      await this.provider.send(template, payload);
    } catch (err) {
      this.logger.error(
        `Mailer send failed: template=${template} to=${MailerService.mask(payload.to)}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
