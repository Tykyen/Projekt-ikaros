import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type {
  IMailerProvider,
  MailerTemplate,
  MailerPayload,
  RenderedMailMessage,
} from '../interfaces/mailer-provider.interface';
import { renderEmail } from '../mailer.templates';

/**
 * Produkční mailer přes SMTP (nodemailer). Aktivuje se přes `MailerModule`
 * factory, když jsou nastavené SMTP env (`SMTP_HOST` + `SMTP_USER`) — jinak
 * zůstává `LogMailerProvider` (dev/test).
 *
 * Env:
 *  - `SMTP_HOST` (např. smtp.gmail.com)
 *  - `SMTP_PORT` (587 STARTTLS / 465 implicit TLS; default 587)
 *  - `SMTP_USER`, `SMTP_PASS` (u Gmailu = App Password, ne běžné heslo)
 *  - `MAIL_FROM` (odesílatel; default „Projekt Ikaros <SMTP_USER>")
 *  - `FRONTEND_URL` (base pro odkazy v mailech — produkční FE URL; v produkci
 *    povinné přes `env.validation`, takže odkazy nikdy nemíří na localhost/cizí web)
 *
 * `send()` chyby propaguje — `MailerService.dispatch()` je swallowne do logu,
 * takže SMTP timeout nikdy nerozbije volající flow (anti-enumeration).
 */
@Injectable()
export class SmtpMailerProvider implements IMailerProvider {
  /** SMTP = reálné odesílání → maily jdou přes Mongo outbox (cap/retry/priorita). */
  readonly queueable = true;

  private readonly logger = new Logger(SmtpMailerProvider.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = Number(config.get<string>('SMTP_PORT') ?? 587);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    this.from = config.get<string>('MAIL_FROM') ?? `Projekt Ikaros <${user}>`;
    // PC-02: žádný hardcoded fallback na starý web. V produkci je FRONTEND_URL
    // povinné (env.validation); dev fallback = localhost (konzistentní se zbytkem).
    this.appUrl = config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    this.transporter = createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS (upgrade)
      // DLV/prod-config-05: na 587 vynuť STARTTLS, ať App Password nejede
      // plaintextem při downgrade útoku. Gmail 587 STARTTLS podporuje.
      requireTLS: port === 587,
      auth: user && pass ? { user, pass } : undefined,
      // RES (styl 33): explicitní timeouty — bez nich SMTP visí na request cestě
      // (forgot-password čeká inline); nodemailer default je bez stropu.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }

  /** LH-03 (log hygiene): e-mail je PII → do logu jen maskovaně (`t***@g***`). */
  private static mask(email: string): string {
    const at = email.indexOf('@');
    if (at < 1) return '***';
    const domain = email.slice(at + 1);
    return `${email[0]}***@${domain[0] ?? ''}***`;
  }

  async send(template: MailerTemplate, payload: MailerPayload): Promise<void> {
    const { subject, text, html } = renderEmail(template, payload, this.appUrl);
    await this.transporter.sendMail({
      from: this.from,
      to: payload.to,
      subject,
      text,
      html,
    });
    // D-AUDIT (2026-07-11): sendMail resolve ≠ doručeno — SMTP server mail jen
    // PŘIJAL do fronty (bounce/spam-filter dorazí později, async). Log to musí
    // říkat přesně, jinak při debugování „mail nedošel" klame.
    this.logger.log(
      `Předáno SMTP serveru (doručení async): ${template} → ${SmtpMailerProvider.mask(payload.to)}`,
    );
  }

  /**
   * Outbox cesta — obsah je už vyrenderovaný v `mail_outbox`. Vrací SMTP
   * odpověď serveru (uloží se k záznamu jako důkaz PŘEDÁNÍ, ne doručení).
   */
  async sendRendered(mail: RenderedMailMessage): Promise<string | undefined> {
    const info = (await this.transporter.sendMail({
      from: this.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })) as { response?: string } | undefined;
    return typeof info?.response === 'string' ? info.response : undefined;
  }
}
