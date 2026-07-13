import { Injectable, Logger } from '@nestjs/common';
import type {
  IMailerProvider,
  MailerTemplate,
  MailerPayload,
  RenderedMailMessage,
} from '../interfaces/mailer-provider.interface';

/**
 * Dev/test provider — strukturovaný log namísto reálného emailu.
 * Pro prod: nahradit SmtpMailerProvider nebo SendGridMailerProvider
 * (separátní deploy task po SP1).
 *
 * Token je zalogován jen prvních 8 znaků (anti-leak). Developer si plný
 * token najde v Mongo `security_tokens` kolekci (jen hash) nebo si vystaví
 * nový přes test endpoint.
 *
 * LH-04 (log hygiene): v PRODUKCI tenhle provider nesmí dumpovat e-maily ani
 * token do logu. Když se tam dostane (chybí SMTP_HOST/SMTP_USER — misconfigurace),
 * jen hlasitě varuje, že mailer není nakonfigurován a mail NEBYL odeslán — žádný
 * obsah. Detailní log zůstává jen mimo produkci (dev log je lokální).
 */
@Injectable()
export class LogMailerProvider implements IMailerProvider {
  /**
   * Dev/test stub → BEZ outboxu (maily jdou přímo do logu, žádné čekání na
   * cron; developer vidí token hned).
   */
  readonly queueable = false;

  private readonly logger = new Logger(LogMailerProvider.name);

  send(template: MailerTemplate, payload: MailerPayload): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        `mailer není nakonfigurován (chybí SMTP_HOST/SMTP_USER) — mail "${template}" NEBYL odeslán. Nastav SMTP env.`,
      );
      return Promise.resolve();
    }
    this.logger.log(
      JSON.stringify({
        event: 'mailer.send',
        template,
        to: payload.to,
        username: payload.username,
        token: payload.token ? `${payload.token.slice(0, 8)}…` : undefined,
        meta: {
          oldEmail: payload.oldEmail,
          newEmail: payload.newEmail,
          decidedUsername: payload.decidedUsername,
          scheduledFor: payload.scheduledFor?.toISOString(),
        },
      }),
    );
    return Promise.resolve();
  }

  /**
   * Outbox cesta — u LogMaileru nenastává (queueable=false, nic se
   * neenqueuuje), implementace jen drží interface poctivý. Stejný prod gate
   * jako `send` (LH-04): v produkci žádný obsah do logu.
   */
  sendRendered(mail: RenderedMailMessage): Promise<string | undefined> {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'mailer není nakonfigurován (chybí SMTP_HOST/SMTP_USER) — mail z outboxu NEBYL odeslán. Nastav SMTP env.',
      );
      return Promise.resolve(undefined);
    }
    this.logger.log(
      JSON.stringify({
        event: 'mailer.sendRendered',
        to: mail.to,
        subject: mail.subject,
      }),
    );
    return Promise.resolve(undefined);
  }
}
