import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MailerTemplate,
  MailerPayload,
} from './interfaces/mailer-provider.interface';
import {
  HIGH_PRIORITY_TEMPLATES,
  MAIL_PRIORITY_HIGH,
  MAIL_PRIORITY_NORMAL,
  type IMailOutboxRepository,
} from './interfaces/mail-outbox.interface';
import { renderEmail } from './mailer.templates';
import { maskEmail } from './mask-email.util';

/**
 * Zápisová strana mail outboxu (D-LAUNCH-GAP „SMTP bez fronty") — vyrenderuje
 * mail a uloží ho do `mail_outbox` jako `pending`. Odesílání řeší cron
 * `MailOutboxSender`. Chybu Mongo zápisu PROPAGUJE — fail-safe fallback
 * (přímé odeslání) dělá `MailerService.dispatch`, ať reset hesla nikdy
 * neumře na frontě.
 */
@Injectable()
export class MailOutboxService {
  private readonly logger = new Logger(MailOutboxService.name);
  private readonly appUrl: string;

  constructor(
    @Inject('IMailOutboxRepository')
    private readonly outboxRepo: IMailOutboxRepository,
    config: ConfigService,
  ) {
    // Stejný fallback jako SmtpMailerProvider (PC-02: v produkci je
    // FRONTEND_URL povinné přes env.validation).
    this.appUrl = config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  async enqueue(
    template: MailerTemplate,
    payload: MailerPayload,
  ): Promise<void> {
    const { subject, text, html } = renderEmail(template, payload, this.appUrl);
    const priority = HIGH_PRIORITY_TEMPLATES.has(template)
      ? MAIL_PRIORITY_HIGH
      : MAIL_PRIORITY_NORMAL;
    await this.outboxRepo.create({
      to: payload.to,
      subject,
      text,
      html,
      category: template,
      priority,
      nextAttemptAt: new Date(),
    });
    this.logger.log(
      `Mail zařazen do outboxu: ${template} → ${maskEmail(payload.to)} (priorita ${priority})`,
    );
  }
}
