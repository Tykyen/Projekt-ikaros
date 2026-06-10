import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type {
  IMailerProvider,
  MailerTemplate,
  MailerPayload,
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
 *  - `FRONTEND_URL` (base pro odkazy v mailech — existující env, např.
 *    https://newmatrix.patrikzplzne.cz)
 *
 * `send()` chyby propaguje — `MailerService.dispatch()` je swallowne do logu,
 * takže SMTP timeout nikdy nerozbije volající flow (anti-enumeration).
 */
@Injectable()
export class SmtpMailerProvider implements IMailerProvider {
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
    this.appUrl =
      config.get<string>('FRONTEND_URL') ?? 'https://newmatrix.patrikzplzne.cz';

    this.transporter = createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS (upgrade)
      auth: user && pass ? { user, pass } : undefined,
    });
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
    this.logger.log(`Sent ${template} → ${payload.to}`);
  }
}
