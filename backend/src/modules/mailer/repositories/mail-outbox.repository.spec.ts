import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoMailOutboxRepository } from './mail-outbox.repository';
import { MailOutboxSchemaClass } from '../schemas/mail-outbox.schema';

describe('MongoMailOutboxRepository', () => {
  let repo: MongoMailOutboxRepository;
  const mockModel = {
    create: jest.fn(),
    findOneAndUpdate: jest.fn(() => ({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    })),
    updateOne: jest.fn(() => ({ exec: jest.fn() })),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoMailOutboxRepository,
        {
          provide: getModelToken(MailOutboxSchemaClass.name),
          useValue: mockModel,
        },
      ],
    }).compile();
    repo = module.get(MongoMailOutboxRepository);
    jest.clearAllMocks();
  });

  it('create → status pending + attempts 0 (server-side defaults, ne volající)', async () => {
    mockModel.create.mockResolvedValue({
      _id: 'm1',
      to: 'a@a.com',
      subject: 's',
      text: 't',
      html: '<p/>',
      category: 'password_reset',
      priority: 1,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      createdAt: new Date(),
    });
    const entry = await repo.create({
      to: 'a@a.com',
      subject: 's',
      text: 't',
      html: '<p/>',
      category: 'password_reset',
      priority: 1,
      nextAttemptAt: new Date(),
    });
    expect(mockModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', attempts: 0 }),
    );
    expect(entry.id).toBe('m1');
    expect(entry.category).toBe('password_reset');
    expect(entry.priority).toBe(1);
  });

  it('claimDue → atomický findOneAndUpdate: pending+due filter, sort priorita→FIFO, lease posun, stav PŘED updatem', async () => {
    const now = new Date('2026-07-12T10:00:00Z');
    const exec = jest.fn().mockResolvedValue({
      _id: 'm1',
      to: 'a@a.com',
      subject: 's',
      text: 't',
      html: '<p/>',
      category: 'email_verification',
      priority: 5,
      status: 'pending',
      attempts: 2,
      nextAttemptAt: now,
      createdAt: now,
    });
    mockModel.findOneAndUpdate.mockReturnValue({ lean: () => ({ exec }) });

    const entry = await repo.claimDue(now, 5 * 60_000);

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { status: 'pending', nextAttemptAt: { $lte: now } },
      { $set: { nextAttemptAt: new Date(now.getTime() + 5 * 60_000) } },
      { sort: { priority: 1, createdAt: 1 }, new: false },
    );
    // `new: false` → vrací se attempts PŘED updatem (kvůli backoff výpočtu).
    expect(entry?.attempts).toBe(2);
  });

  it('claimDue → null když nic není due', async () => {
    mockModel.findOneAndUpdate.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });
    await expect(repo.claimDue(new Date(), 1000)).resolves.toBeNull();
  });

  it('markSent → status sent + sentAt + smtpResponse + attempts +1', async () => {
    const exec = jest.fn();
    mockModel.updateOne.mockReturnValue({ exec });
    const sentAt = new Date();
    await repo.markSent('m1', sentAt, '250 OK');
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { _id: 'm1' },
      {
        $set: { status: 'sent', sentAt, smtpResponse: '250 OK' },
        $inc: { attempts: 1 },
      },
    );
  });

  it('scheduleRetry → attempts + nextAttemptAt + lastError, status zůstává pending', async () => {
    mockModel.updateOne.mockReturnValue({ exec: jest.fn() });
    const next = new Date();
    await repo.scheduleRetry('m1', 2, next, 'boom');
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { _id: 'm1' },
      { $set: { attempts: 2, nextAttemptAt: next, lastError: 'boom' } },
    );
  });

  it('markFailed → status failed + lastError (SMTP chyba per adresát)', async () => {
    mockModel.updateOne.mockReturnValue({ exec: jest.fn() });
    await repo.markFailed('m1', 5, '550 user unknown');
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { _id: 'm1' },
      {
        $set: { status: 'failed', attempts: 5, lastError: '550 user unknown' },
      },
    );
  });

  it('defer → jen posun nextAttemptAt (bez započítání pokusu)', async () => {
    mockModel.updateOne.mockReturnValue({ exec: jest.fn() });
    const next = new Date('2026-07-13T00:05:00Z');
    await repo.defer('m1', next);
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { _id: 'm1' },
      { $set: { nextAttemptAt: next } },
    );
  });
});
