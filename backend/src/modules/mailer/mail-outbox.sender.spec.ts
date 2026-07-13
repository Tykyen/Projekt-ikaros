import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailOutboxSender } from './mail-outbox.sender';
import { CronLockService } from '../../common/locks/cron-lock.service';
import { AlertService } from '../../common/alerting/alert.service';
import {
  MAIL_PRIORITY_HIGH,
  MAIL_PRIORITY_NORMAL,
  type MailOutboxEntry,
} from './interfaces/mail-outbox.interface';

function makeMail(overrides: Partial<MailOutboxEntry> = {}): MailOutboxEntry {
  return {
    id: 'm1',
    to: 'a@a.com',
    subject: 'subj',
    text: 'txt',
    html: '<p>html</p>',
    category: 'email_verification',
    priority: MAIL_PRIORITY_NORMAL,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('MailOutboxSender', () => {
  let sender: MailOutboxSender;
  const outboxRepo = {
    create: jest.fn(),
    claimDue: jest.fn(),
    markSent: jest.fn(),
    scheduleRetry: jest.fn(),
    markFailed: jest.fn(),
    defer: jest.fn(),
  };
  const counterRepo = {
    getSent: jest.fn(),
    incrementSent: jest.fn(),
  };
  const provider = {
    queueable: true,
    send: jest.fn(),
    sendRendered: jest.fn(),
  };
  const cronLock = {
    withLock: jest.fn((_name: string, fn: () => Promise<void> | void) =>
      Promise.resolve(fn()),
    ),
  };
  const alerts = { alert: jest.fn().mockResolvedValue(undefined) };
  let logSpies: jest.SpyInstance[] = [];

  /** claimDue vrací postupně maily z fronty, pak null (konec dávky). */
  function queueMails(mails: MailOutboxEntry[]): void {
    const q = [...mails];
    outboxRepo.claimDue.mockImplementation(() =>
      Promise.resolve(q.shift() ?? null),
    );
  }

  async function build(env: Record<string, string> = {}): Promise<void> {
    const module = await Test.createTestingModule({
      providers: [
        MailOutboxSender,
        { provide: 'IMailOutboxRepository', useValue: outboxRepo },
        { provide: 'IMailDailyCounterRepository', useValue: counterRepo },
        { provide: 'IMailerProvider', useValue: provider },
        { provide: CronLockService, useValue: cronLock },
        { provide: AlertService, useValue: alerts },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    sender = module.get(MailOutboxSender);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    logSpies = [
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {}),
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
    ];
    provider.queueable = true;
    provider.sendRendered.mockResolvedValue('250 2.0.0 OK');
    counterRepo.getSent.mockResolvedValue(0);
    counterRepo.incrementSent.mockImplementation(() => {
      const calls = counterRepo.incrementSent.mock.calls.length;
      return Promise.resolve(calls);
    });
    queueMails([]);
    await build();
  });

  afterEach(() => logSpies.forEach((s) => s.mockRestore()));

  describe('tickCron', () => {
    it('queueable provider → dávka běží pod distribuovaným lockem', async () => {
      await sender.tickCron();
      expect(cronLock.withLock).toHaveBeenCalledWith(
        'mail-outbox-sender',
        expect.any(Function),
      );
      // fn uvnitř locku opravdu spustila dávku (claim proběhl).
      expect(outboxRepo.claimDue).toHaveBeenCalled();
    });

    it('LogMailerProvider (queueable=false) → no-op, žádný lock ani Mongo dotaz', async () => {
      provider.queueable = false;
      await sender.tickCron();
      expect(cronLock.withLock).not.toHaveBeenCalled();
      expect(outboxRepo.claimDue).not.toHaveBeenCalled();
    });
  });

  describe('odeslání (enqueue → cron pošle)', () => {
    it('due mail → sendRendered + markSent (s SMTP odpovědí) + denní čítač +1', async () => {
      queueMails([makeMail()]);
      await sender.processBatch(new Date('2026-07-12T10:00:00Z'));

      expect(provider.sendRendered).toHaveBeenCalledWith({
        to: 'a@a.com',
        subject: 'subj',
        text: 'txt',
        html: '<p>html</p>',
      });
      expect(outboxRepo.markSent).toHaveBeenCalledWith(
        'm1',
        expect.any(Date),
        '250 2.0.0 OK',
      );
      expect(counterRepo.incrementSent).toHaveBeenCalledWith('2026-07-12');
      expect(outboxRepo.scheduleRetry).not.toHaveBeenCalled();
      expect(outboxRepo.markFailed).not.toHaveBeenCalled();
    });

    it('claim probíhá až do vyčerpání due mailů (v rámci BATCH_SIZE)', async () => {
      queueMails([
        makeMail({ id: 'm1' }),
        makeMail({ id: 'm2' }),
        makeMail({ id: 'm3' }),
      ]);
      await sender.processBatch();
      expect(provider.sendRendered).toHaveBeenCalledTimes(3);
      // 3 maily + 1 prázdný claim (null) = konec dávky.
      expect(outboxRepo.claimDue).toHaveBeenCalledTimes(4);
    });
  });

  describe('retry s backoffem', () => {
    it('1. selhání → scheduleRetry(attempts=1, +1 min, lastError)', async () => {
      const now = new Date('2026-07-12T10:00:00Z');
      queueMails([makeMail({ attempts: 0 })]);
      provider.sendRendered.mockRejectedValueOnce(new Error('451 4.3.0 boom'));

      await sender.processBatch(now);

      expect(outboxRepo.scheduleRetry).toHaveBeenCalledWith(
        'm1',
        1,
        new Date(now.getTime() + 60_000),
        '451 4.3.0 boom',
      );
      expect(outboxRepo.markSent).not.toHaveBeenCalled();
      expect(counterRepo.incrementSent).not.toHaveBeenCalled();
    });

    it('3. selhání → backoff 30 min', async () => {
      const now = new Date('2026-07-12T10:00:00Z');
      queueMails([makeMail({ attempts: 2 })]);
      provider.sendRendered.mockRejectedValueOnce(new Error('timeout'));

      await sender.processBatch(now);

      expect(outboxRepo.scheduleRetry).toHaveBeenCalledWith(
        'm1',
        3,
        new Date(now.getTime() + 30 * 60_000),
        'timeout',
      );
    });

    it('5. selhání (MAX_ATTEMPTS) → failed + lastError + alert', async () => {
      queueMails([makeMail({ attempts: 4 })]);
      provider.sendRendered.mockRejectedValueOnce(
        new Error('550 5.1.1 user unknown'),
      );

      await sender.processBatch();

      expect(outboxRepo.markFailed).toHaveBeenCalledWith(
        'm1',
        5,
        '550 5.1.1 user unknown',
      );
      expect(outboxRepo.scheduleRetry).not.toHaveBeenCalled();
      expect(alerts.alert).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('trvale selhal'),
        expect.stringContaining('550 5.1.1 user unknown'),
      );
    });

    it('trvalé selhání resetu hesla (vysoká priorita) → alert critical', async () => {
      queueMails([
        makeMail({
          attempts: 4,
          category: 'password_reset',
          priority: MAIL_PRIORITY_HIGH,
        }),
      ]);
      provider.sendRendered.mockRejectedValueOnce(new Error('boom'));

      await sender.processBatch();

      expect(alerts.alert).toHaveBeenCalledWith(
        'critical',
        expect.any(String),
        expect.any(String),
      );
    });

    it('selhání jednoho mailu nezastaví zbytek dávky', async () => {
      queueMails([makeMail({ id: 'm1' }), makeMail({ id: 'm2' })]);
      provider.sendRendered
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('250 OK');

      await sender.processBatch();

      expect(outboxRepo.scheduleRetry).toHaveBeenCalledWith(
        'm1',
        1,
        expect.any(Date),
        'boom',
      );
      expect(outboxRepo.markSent).toHaveBeenCalledWith(
        'm2',
        expect.any(Date),
        '250 OK',
      );
    });
  });

  describe('denní cap (SMTP_DAILY_CAP)', () => {
    it('cap dosažen → normální priorita se odloží na další den + logWarn + alert; nic se neposílá', async () => {
      await build({ SMTP_DAILY_CAP: '400' });
      counterRepo.getSent.mockResolvedValue(400);
      const now = new Date('2026-07-12T10:00:00Z');
      queueMails([makeMail({ id: 'm1' }), makeMail({ id: 'm2' })]);

      await sender.processBatch(now);

      expect(provider.sendRendered).not.toHaveBeenCalled();
      // Odloženo na začátek dalšího UTC dne (+5 min rezerva).
      expect(outboxRepo.defer).toHaveBeenCalledWith(
        'm1',
        new Date('2026-07-13T00:05:00Z'),
      );
      expect(outboxRepo.defer).toHaveBeenCalledWith('m2', expect.any(Date));
      expect(alerts.alert).toHaveBeenCalledWith(
        'warn',
        'SMTP denní cap dosažen',
        expect.stringContaining('2'),
        expect.objectContaining({ dedupeKey: 'smtp-daily-cap' }),
      );
    });

    it('cap dosažen → reset hesla (vysoká priorita) PROJDE', async () => {
      await build({ SMTP_DAILY_CAP: '400' });
      counterRepo.getSent.mockResolvedValue(400);
      counterRepo.incrementSent.mockResolvedValue(401);
      queueMails([
        makeMail({
          id: 'reset',
          category: 'password_reset',
          priority: MAIL_PRIORITY_HIGH,
        }),
        makeMail({ id: 'notice' }),
      ]);

      await sender.processBatch();

      expect(provider.sendRendered).toHaveBeenCalledTimes(1);
      expect(outboxRepo.markSent).toHaveBeenCalledWith(
        'reset',
        expect.any(Date),
        expect.anything(),
      );
      expect(outboxRepo.defer).toHaveBeenCalledWith('notice', expect.any(Date));
    });

    it('cap se dosáhne UPROSTŘED dávky → zbytek normální priority se odloží', async () => {
      await build({ SMTP_DAILY_CAP: '400' });
      counterRepo.getSent.mockResolvedValue(399);
      counterRepo.incrementSent.mockResolvedValue(400);
      queueMails([makeMail({ id: 'm1' }), makeMail({ id: 'm2' })]);

      await sender.processBatch();

      expect(provider.sendRendered).toHaveBeenCalledTimes(1);
      expect(outboxRepo.markSent).toHaveBeenCalledWith(
        'm1',
        expect.any(Date),
        expect.anything(),
      );
      expect(outboxRepo.defer).toHaveBeenCalledWith('m2', expect.any(Date));
    });

    it('bez env → default cap 400', async () => {
      await build({});
      counterRepo.getSent.mockResolvedValue(400);
      queueMails([makeMail()]);
      await sender.processBatch();
      expect(outboxRepo.defer).toHaveBeenCalled();
      expect(provider.sendRendered).not.toHaveBeenCalled();
    });

    it('nevalidní SMTP_DAILY_CAP → default 400 (pod capem se posílá)', async () => {
      await build({ SMTP_DAILY_CAP: 'nesmysl' });
      counterRepo.getSent.mockResolvedValue(399);
      queueMails([makeMail()]);
      await sender.processBatch();
      expect(provider.sendRendered).toHaveBeenCalledTimes(1);
    });
  });

  describe('účetnictví po odeslání', () => {
    it('markSent selže → mail se NEretryuje jako selhaný send (jen logError)', async () => {
      queueMails([makeMail()]);
      outboxRepo.markSent.mockRejectedValueOnce(new Error('Mongo down'));

      await sender.processBatch();

      // Send proběhl, účetní chyba nesmí vyvolat scheduleRetry/markFailed.
      expect(provider.sendRendered).toHaveBeenCalledTimes(1);
      expect(outboxRepo.scheduleRetry).not.toHaveBeenCalled();
      expect(outboxRepo.markFailed).not.toHaveBeenCalled();
    });
  });

  describe('pomocné výpočty', () => {
    it('dayKey = UTC den', () => {
      expect(MailOutboxSender.dayKey(new Date('2026-07-12T23:59:59Z'))).toBe(
        '2026-07-12',
      );
    });

    it('nextDayStart = další UTC půlnoc +5 min (i přes přelom měsíce)', () => {
      expect(
        MailOutboxSender.nextDayStart(new Date('2026-07-31T22:00:00Z')),
      ).toEqual(new Date('2026-08-01T00:05:00Z'));
    });
  });
});
