import { ConfigService } from '@nestjs/config';
import { createMailerProvider } from './mailer.module';
import { LogMailerProvider } from './providers/log-mailer.provider';
import { SmtpMailerProvider } from './providers/smtp-mailer.provider';

function configWith(env: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
}

describe('createMailerProvider', () => {
  it('bez SMTP env → LogMailerProvider (dev/test stub)', () => {
    const provider = createMailerProvider(configWith({}));
    expect(provider).toBeInstanceOf(LogMailerProvider);
  });

  it('jen SMTP_HOST bez SMTP_USER → stále stub (neúplná konfigurace)', () => {
    const provider = createMailerProvider(
      configWith({ SMTP_HOST: 'smtp.gmail.com' }),
    );
    expect(provider).toBeInstanceOf(LogMailerProvider);
  });

  it('SMTP_HOST + SMTP_USER → SmtpMailerProvider', () => {
    const provider = createMailerProvider(
      configWith({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_USER: 'tyky.projekt.ikaros@gmail.com',
        SMTP_PASS: 'app-password',
      }),
    );
    expect(provider).toBeInstanceOf(SmtpMailerProvider);
  });
});
