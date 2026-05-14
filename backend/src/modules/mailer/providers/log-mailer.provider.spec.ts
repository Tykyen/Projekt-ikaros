import { Logger } from '@nestjs/common';
import { LogMailerProvider } from './log-mailer.provider';

describe('LogMailerProvider', () => {
  let provider: LogMailerProvider;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new LogMailerProvider();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('zaloguje template + payload (token zkrácen na 8 chars)', async () => {
    await provider.send('password_reset', {
      to: 'a@a.com',
      username: 'alice',
      token: '0123456789abcdef0123456789abcdef',
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged: Record<string, unknown> = JSON.parse(
      logSpy.mock.calls[0][0] as string,
    );
    expect(logged.event).toBe('mailer.send');
    expect(logged.template).toBe('password_reset');
    expect(logged.to).toBe('a@a.com');
    expect(logged.username).toBe('alice');
    expect(logged.token).toBe('01234567…');
  });

  it('token chybí (email_change_notice) → token: undefined v logu', async () => {
    await provider.send('email_change_notice', {
      to: 'a@a.com',
      username: 'alice',
      oldEmail: 'old@a.com',
      newEmail: 'new@a.com',
    });
    const logged: Record<string, Record<string, string>> = JSON.parse(
      logSpy.mock.calls[0][0] as string,
    );
    expect(logged.token).toBeUndefined();
    expect(logged.meta.oldEmail).toBe('old@a.com');
    expect(logged.meta.newEmail).toBe('new@a.com');
  });
});
