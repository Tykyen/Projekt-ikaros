import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailOutboxService } from './mail-outbox.service';
import {
  MAIL_PRIORITY_HIGH,
  MAIL_PRIORITY_NORMAL,
} from './interfaces/mail-outbox.interface';

describe('MailOutboxService — enqueue', () => {
  let service: MailOutboxService;
  const repo = { create: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MailOutboxService,
        { provide: 'IMailOutboxRepository', useValue: repo },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => ({ FRONTEND_URL: 'https://app.test' })[k],
          },
        },
      ],
    }).compile();
    service = module.get(MailOutboxService);
    jest.clearAllMocks();
    repo.create.mockResolvedValue({ id: 'm1' });
  });

  it('reset hesla → vyrenderovaný obsah + VYSOKÁ priorita', async () => {
    await service.enqueue('password_reset', {
      to: 'a@a.com',
      username: 'alice',
      token: 'tok123',
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
    const input = repo.create.mock.calls[0][0] as Record<string, unknown>;
    expect(input.to).toBe('a@a.com');
    expect(input.category).toBe('password_reset');
    expect(input.priority).toBe(MAIL_PRIORITY_HIGH);
    expect(input.nextAttemptAt).toBeInstanceOf(Date);
    // Obsah je už vyrenderovaný (subject/text/html) a nese odkaz s tokenem.
    expect(input.subject).toContain('obnovení hesla');
    expect(String(input.html)).toContain(
      'https://app.test/reset-password?token=tok123',
    );
    expect(String(input.text)).toContain('tok123');
  });

  it('verifikace registrace → NORMÁLNÍ priorita (registrační flood nesmí obejít cap)', async () => {
    await service.enqueue('email_verification', {
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
    const input = repo.create.mock.calls[0][0] as Record<string, unknown>;
    expect(input.priority).toBe(MAIL_PRIORITY_NORMAL);
  });

  it('chyba Mongo zápisu PROPAGUJE (fallback řeší MailerService.dispatch)', async () => {
    repo.create.mockRejectedValueOnce(new Error('Mongo down'));
    await expect(
      service.enqueue('password_reset', {
        to: 'a@a.com',
        username: 'alice',
        token: 'tok',
      }),
    ).rejects.toThrow('Mongo down');
  });
});
