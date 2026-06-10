import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';
import { LogMailerProvider } from './providers/log-mailer.provider';
import { SmtpMailerProvider } from './providers/smtp-mailer.provider';
import type { IMailerProvider } from './interfaces/mailer-provider.interface';

/**
 * Provider se volí za běhu podle env: když jsou nastavené `SMTP_HOST` +
 * `SMTP_USER` → reálné odesílání přes SMTP; jinak `LogMailerProvider`
 * (dev/test jen loguje). Nasazení SMTP tak nevyžaduje zásah do kódu a lokální
 * vývoj zůstává bez odesílání.
 */
export function createMailerProvider(config: ConfigService): IMailerProvider {
  const hasSmtp =
    !!config.get<string>('SMTP_HOST') && !!config.get<string>('SMTP_USER');
  return hasSmtp ? new SmtpMailerProvider(config) : new LogMailerProvider();
}

@Global()
@Module({
  providers: [
    MailerService,
    {
      provide: 'IMailerProvider',
      inject: [ConfigService],
      useFactory: createMailerProvider,
    },
  ],
  exports: [MailerService],
})
export class MailerModule {}
