import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { LogMailerProvider } from './providers/log-mailer.provider';

@Global()
@Module({
  providers: [
    MailerService,
    {
      provide: 'IMailerProvider',
      useClass: LogMailerProvider,
    },
  ],
  exports: [MailerService],
})
export class MailerModule {}
