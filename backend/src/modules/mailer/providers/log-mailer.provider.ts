import { Injectable, Logger } from '@nestjs/common';
import type {
  IMailerProvider,
  MailerTemplate,
  MailerPayload,
} from '../interfaces/mailer-provider.interface';

/**
 * Dev/test provider — strukturovaný log namísto reálného emailu.
 * Pro prod: nahradit SmtpMailerProvider nebo SendGridMailerProvider
 * (separátní deploy task po SP1).
 *
 * Token je zalogován jen prvních 8 znaků (anti-leak). Developer si plný
 * token najde v Mongo `security_tokens` kolekci (jen hash) nebo si vystaví
 * nový přes test endpoint.
 */
@Injectable()
export class LogMailerProvider implements IMailerProvider {
  private readonly logger = new Logger(LogMailerProvider.name);

  send(template: MailerTemplate, payload: MailerPayload): Promise<void> {
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
}
