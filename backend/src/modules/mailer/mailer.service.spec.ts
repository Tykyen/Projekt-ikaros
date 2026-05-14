import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MailerService } from './mailer.service';
import type { IMailerProvider } from './interfaces/mailer-provider.interface';

describe('MailerService', () => {
  let service: MailerService;
  let mockProvider: jest.Mocked<IMailerProvider>;

  beforeEach(async () => {
    mockProvider = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        MailerService,
        { provide: 'IMailerProvider', useValue: mockProvider },
      ],
    }).compile();
    service = module.get(MailerService);
  });

  it('sendPasswordReset → provider.send("password_reset", opts)', async () => {
    await service.sendPasswordReset({
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
    expect(mockProvider.send).toHaveBeenCalledWith('password_reset', {
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
  });

  it('sendEmailVerification → "email_verification"', async () => {
    await service.sendEmailVerification({
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'email_verification',
      expect.objectContaining({ token: 'tok' }),
    );
  });

  it('sendEmailChangeConfirm → "email_change_confirm"', async () => {
    await service.sendEmailChangeConfirm({
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'email_change_confirm',
      expect.objectContaining({ token: 'tok' }),
    );
  });

  it('sendEmailChangeNotice → "email_change_notice" + oldEmail/newEmail', async () => {
    await service.sendEmailChangeNotice({
      to: 'a@a.com',
      username: 'alice',
      oldEmail: 'old@a.com',
      newEmail: 'new@a.com',
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'email_change_notice',
      expect.objectContaining({
        oldEmail: 'old@a.com',
        newEmail: 'new@a.com',
      }),
    );
  });

  it('sendUsernameDecided → "username_decided" + decidedUsername', async () => {
    await service.sendUsernameDecided({
      to: 'a@a.com',
      username: 'alice',
      decidedUsername: 'aliceNew',
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'username_decided',
      expect.objectContaining({ decidedUsername: 'aliceNew' }),
    );
  });

  it('sendAccountDeletionScheduled → "account_deletion_scheduled" + scheduledFor', async () => {
    const dt = new Date('2026-06-01');
    await service.sendAccountDeletionScheduled({
      to: 'a@a.com',
      username: 'alice',
      scheduledFor: dt,
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'account_deletion_scheduled',
      expect.objectContaining({ scheduledFor: dt }),
    );
  });

  it('provider throw → service nehází, jen loguje error', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    mockProvider.send.mockRejectedValueOnce(new Error('SMTP timeout'));
    await expect(
      service.sendPasswordReset({
        to: 'a@a.com',
        username: 'alice',
        token: 'tok',
      }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
