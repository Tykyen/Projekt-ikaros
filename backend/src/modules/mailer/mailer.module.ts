import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MailerService } from './mailer.service';
import { MailOutboxService } from './mail-outbox.service';
import { MailOutboxSender } from './mail-outbox.sender';
import { LogMailerProvider } from './providers/log-mailer.provider';
import { SmtpMailerProvider } from './providers/smtp-mailer.provider';
import { MongoMailOutboxRepository } from './repositories/mail-outbox.repository';
import { MongoMailDailyCounterRepository } from './repositories/mail-daily-counter.repository';
import {
  MailOutboxSchemaClass,
  MailOutboxSchema,
} from './schemas/mail-outbox.schema';
import {
  MailDailyCounterSchemaClass,
  MailDailyCounterSchema,
} from './schemas/mail-daily-counter.schema';
import { AlertModule } from '../../common/alerting/alert.module';
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

/**
 * D-LAUNCH-GAP „SMTP bez fronty": SMTP cesta jde přes Mongo outbox
 * (`mail_outbox` + denní čítač `mail_daily_counters`), odesílá cron
 * `MailOutboxSender`. Veřejný kontrakt = pouze `MailerService`.
 * `AlertModule` importován explicitně (je @Global v AppModule, ale e2e testy
 * skládají appku selektivně — bez importu by sender nedostal AlertService).
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MailOutboxSchemaClass.name, schema: MailOutboxSchema },
      {
        name: MailDailyCounterSchemaClass.name,
        schema: MailDailyCounterSchema,
      },
    ]),
    AlertModule,
  ],
  providers: [
    MailerService,
    MailOutboxService,
    MailOutboxSender,
    {
      provide: 'IMailerProvider',
      inject: [ConfigService],
      useFactory: createMailerProvider,
    },
    { provide: 'IMailOutboxRepository', useClass: MongoMailOutboxRepository },
    {
      provide: 'IMailDailyCounterRepository',
      useClass: MongoMailDailyCounterRepository,
    },
  ],
  exports: [MailerService],
})
export class MailerModule {}
